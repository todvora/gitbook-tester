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


function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

// generate basic book structure (README.md, SUMMARY.md)
var createBook = function(content, children) {
  return Q.nfcall(temp.mkdir, 'gitbook-tester')
    .then(function(dirPath) {
      var readme = Q.nfcall(fs.writeFile, path.join(dirPath, 'README.md'), content);
      var summary = Q.nfcall(fs.writeFile, path.join(dirPath, 'SUMMARY.md'), '# Summary\n\n* [Introduction](README.md)');
      return Q.all([readme, summary])
        .then(function() {
          return dirPath;
        });
    });
};

// install book.json to temp book directory. Preprocess book.json and remove from plugins all locally provided
var installBookJson = function(bookPath, bookJson, modules) {
  var book = bookJson || {};
  if(typeof book.plugins !== 'undefined' && modules.length > 0) {
    // remove all plugins locally installed plugins from book.json (they would be installed from NPM instead of
    // symlinked.
    var moduleNames = modules.map(function(module) {
      return module.name.replace('gitbook-plugin-','');
    });
    var remotePlugins = book.plugins.filter(function(plugin) {
      return moduleNames.indexOf(plugin) == -1;
    });
    book.plugins = remotePlugins;
  }
  return Q.nfcall(fs.writeFile, path.join(bookPath, 'book.json'), JSON.stringify(book))
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

// read attached folders(=local node modules), normalize path, read module name from package.json
var preprocessLocalModules = function(modules) {
  return modules.map(function(directory) {
    var pathToModule = path.normalize(directory);
    var packageJson = require(path.join(pathToModule, 'package.json'));
    var moduleName = packageJson.name;
    return {dir:pathToModule, name:moduleName};
  });
};

// create symlinks to local plugins
var attachLocalPlugins = function(bookPath, localModules) {
    var nodeModulesPath = path.join(bookPath, 'node_modules');
    return Q.nfcall(fs.mkdir, nodeModulesPath) // create node_modules directory
      .then(function() {
        var promises = localModules.map(function(module) {
          console.log('creating symlink for plugin ' + module.name + ' to directory ' + module.dir);
          var target = path.join(nodeModulesPath, module.name);
          return Q.nfcall(fs.symlink, module.dir, target);
        });
        return Q.all(promises);
      })  // create symlinks to all local modules
      .then(function(){return bookPath;}); // return book path
};

var gitbookRunnablePath = function() {
  // gitbook-cli should be installed globally. That sometimes requires root / superadmin permissions
  // we can execute gitbook directly from installed dependency without globally installed gitbook
    return require.resolve('gitbook-cli');
};

// run 'gitbook install' to download all required external plugins
var install = function(bookPath) {
  return runCommand(gitbookRunnablePath(), ['install', bookPath])
    .then(function(){return bookPath;});
};

// execute 'gitbook build /temp/path/to/generated/book'
var build = function(bookPath) {
  return runCommand(gitbookRunnablePath(), ['build', bookPath])
    .then(function(){return bookPath;});
};

// traverse rendered book and return all html files found
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

// convert read html content, parse only <section> content (ignore header, navigation etc)
// TODO: make it configurable, if someone want to test other parts of generated pages
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

// main entry point - generate book, install plugins, attach local modules, read and transform html pages
var execute = function(htmlContent, bookJson, children, localModules) {
  var modules = preprocessLocalModules(localModules);
  return createBook(htmlContent, bookJson, children)
    .then(function(bookPath){
        return attachLocalPlugins(bookPath, modules);
    })
    .then(function(bookPath){return installBookJson(bookPath, bookJson, modules);})
    .then(install)
    .then(build)
    .then(readPages)
    .then(parsePages);
};

function Builder() {
  this._modules = [];
}

// attach Markdown content to book (currently only to README.md - single page book)
Builder.prototype.withContent = function(content) {
    this._content = content;
    return this;
};

// attach book.json. Expects JS object
Builder.prototype.withBookJson = function(bookJson) {
  this._bookJson = bookJson;
  return this;
};

// attach provided directory / node module as a gitbook plugin. Requires valid npm module structure and package.json
Builder.prototype.withLocalPlugin = function(dir) {
  this._modules.push(dir);
  return this;
};

// start build, return promise with processed html content of pages
Builder.prototype.create = function() {
  return execute(this._content, this._bookJson || {}, [], this._modules);
};

module.exports = {
  builder: function() {return new Builder();},
};