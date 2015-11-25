/*jslint node: true */
"use strict";

var child = require('child-process-promise');
var fs = require('fs');
var finder = require('findit');
var path = require('path');
var Q = require('q');
var cheerio = require('cheerio');
var temp = require('temp');
var path = require('path');

temp.track();

var createBook = function(content, bookJson, children) {
  return Q.nfcall(temp.mkdir, 'gitbook-tester')
    .then(function(dirPath) {
      var readme = Q.nfcall(fs.writeFile, path.join(dirPath, 'README.md'), content);
      var summary = Q.nfcall(fs.writeFile, path.join(dirPath, 'SUMMARY.md'), '# Summary\n\n* [Introduction](README.md)');
      var promises = [readme, summary];
      if(bookJson !== null && bookJson != {}) {
        promises.push(Q.nfcall(fs.writeFile, path.join(dirPath, 'book.json'), JSON.stringify(bookJson)));
      }
      return Q.all(promises)
        .then(function() {
          return dirPath;
        });
    });
};

var runCommand = function(command, args) {
  return child.spawn(command, args)
    .progress(function (childProcess) {
      childProcess.stdout.on('data', function (data) {
        process.stdout.write('>  ' + data.toString());
      });
      childProcess.stderr.on('data', function (data) {
        process.stderr.write('>  ' + data.toString());
      });
    });
};

var attachLocalPlugins = function(bookPath, localModules) {

  if(typeof localModules !== 'undefined') {
    var modulesPath = path.join(bookPath, 'node_modules');

    return Q.nfcall(fs.mkdir, modulesPath)
      .then(Q.nfcall(fs.symlink, localModules, path.join(modulesPath, path.basename(localModules))))
      .then(function(){return bookPath;});
  }
  return bookPath;
};

var install = function(bookPath) {
  return runCommand('gitbook', ['install', bookPath])
    .then(function(){return bookPath;});
};


var build = function(bookPath) {
  return runCommand('gitbook', ['build', bookPath])
    .then(function(){return bookPath;});
};

var readPages = function(bookPath) {
  var deferred = Q.defer();
  var find = finder(path.join(bookPath, '_book'));
  var pages = [];

  find.on('file', function (file, stat) {
    if(file.endsWith('.html')) {
      pages.push(file);
    }
  });
  find.on('end', function () {deferred.resolve(pages);});
  find.on('error', deferred.reject);
  return deferred.promise;
};

var parsePages = function(files) {
 var deferred = Q.defer();
   var promises = files.map(function(filename){
     return Q.nfcall(fs.readFile, filename, 'utf-8')
       .then(function(fileContent){
         var $ = cheerio.load(fileContent);
         return Q.resolve({
         'path':filename,
         'content':$('section').html().trim()
         });
       });
   });
   return Q.all(promises);
};

var execute = function(htmlContent, bookJson, children, localDirs) {
  return createBook(htmlContent, bookJson, children)
    .then(function(bookPath){
        return attachLocalPlugins(bookPath, localDirs);
    })
    .then(install)
    .then(build)
    .then(readPages)
    .then(parsePages);
};

function Builder() {}

Builder.prototype.withContent = function(content) {
    this._content = content;
    return this;
};

Builder.prototype.withBookJson = function(bookJson) {
  this._bookJson = bookJson;
  return this;
};

Builder.prototype.withLocalPlugin = function(mod) {
  this._module = mod;
  return this;
};

Builder.prototype.create = function() {
  return execute(this._content, this._bookJson || {}, [], this._module);
};

module.exports = {
  builder: function() {return new Builder();},
};