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

//temp.track();

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

var createBook = function(content, children) {
  return Q.nfcall(temp.mkdir, 'gitbook-tester')
    .then(function(dirPath) {
      console.log(dirPath);
      var readme = Q.nfcall(fs.writeFile, path.join(dirPath, 'README.md'), content);
      var summary = Q.nfcall(fs.writeFile, path.join(dirPath, 'SUMMARY.md'), '# Summary\n\n* [Introduction](README.md)');
      return Q.all([readme, summary])
        .then(function() {
          return dirPath;
        });
    });
};

var installBookJson = function(bookPath, bookJson) {
  return Q.nfcall(fs.writeFile, path.join(bookPath, 'book.json'), JSON.stringify(bookJson || {}))
    .then(function(){return bookPath;});
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
    var nodeModulesPath = path.join(bookPath, 'node_modules');
    return Q.nfcall(fs.mkdir, nodeModulesPath) // create node_modules directory
      .then(function(){
        var promises = localModules.map(function(module) {
          var pathToModule = path.normalize(module.dir);
          var moduleName = module.name || path.basename(pathToModule);
          console.log('creating symlink for plugin ' + moduleName + ' to directory ' + pathToModule);
          var target = path.join(nodeModulesPath, moduleName);
          return Q.nfcall(fs.symlink, pathToModule, target);
        });
        return Q.all(promises);
      })  // create symlinks to all local modules
      .then(function(){return bookPath;}); // return book path
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
    if(endsWith(file, '.html')) {
      pages.push(file);
    }
  });
  find.on('end', function () {deferred.resolve(pages);});
  find.on('error', deferred.reject);
  return deferred.promise;
};

var parsePages = function(files) {
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

var execute = function(htmlContent, bookJson, children, modules) {
  return createBook(htmlContent, bookJson, children)
    .then(function(bookPath){
        return attachLocalPlugins(bookPath, modules);
    })
    .then(install)
    .then(function(bookPath){return installBookJson(bookPath, bookJson);})
    .then(build)
    .then(readPages)
    .then(parsePages);
};

function Builder() {
  this._modules = [];
}

Builder.prototype.withContent = function(content) {
    this._content = content;
    return this;
};

Builder.prototype.withBookJson = function(bookJson) {
  this._bookJson = bookJson;
  return this;
};

Builder.prototype.withLocalPlugin = function(dir, name) {
  this._modules.push({dir:dir, name:name});
  return this;
};

Builder.prototype.create = function() {
  return execute(this._content, this._bookJson || {}, [], this._modules);
};

module.exports = {
  builder: function() {return new Builder();},
};