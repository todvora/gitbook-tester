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
var _ = require('lodash');
var mkdirp = require('mkdirp');

var winston = require('winston');

temp.track();

function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

// generate basic book structure (README.md, SUMMARY.md)
var createBook = function(content, children) {
  return Q.nfcall(temp.mkdir, 'gitbook-tester')
    .then(function(dirPath) {

      var summaryPages = children.map(function(page){
        return '* ['+page.name+']('+page.name+'.md)';
      });

      var pagesPromises = children.map(function(page) {
        return Q.nfcall(fs.writeFile, path.join(dirPath, page.name + '.md'), page.content);
      });

      var summaryContent = '# Summary\n\n* [Introduction](README.md)' +'\n'+ summaryPages.join('\n');

      var summary = Q.nfcall(fs.writeFile, path.join(dirPath, 'SUMMARY.md'), summaryContent);
      var readme = Q.nfcall(fs.writeFile, path.join(dirPath, 'README.md'), content);

      return Q.all([readme, summary].concat(pagesPromises))
        .then(function() {
          return dirPath;
        });
    });
};

// install book.json to temp book directory. Preprocess book.json and remove from plugins all locally provided
var installBookJson = function(bookPath, bookJson, modules, withLocalPlugins) {
  var localModules = modules || [];
  var book = {plugins:[]};

  if(bookJson) {
    book = _.cloneDeep(bookJson);
  }

  var localModuleNames = localModules.map(function(module) {
    return module.name.replace('gitbook-plugin-','');
  });

  if(!withLocalPlugins) {
    // remove all plugins locally installed plugins from book.json (they would be installed from NPM instead of
    // symlinked.
    var listedPlugins = book.plugins || [];
    book.plugins = listedPlugins.filter(function(plugin) {
      return localModuleNames.indexOf(plugin) == -1;
    });
  } else {
    book.plugins = _.union(book.plugins, localModuleNames);
  }
  return Q.nfcall(fs.writeFile, path.join(bookPath, 'book.json'), JSON.stringify(book))
    .then(function(){return bookPath;});
};

var runCommand = function(command, args) {
  return child.spawn(command, args)
    .progress(function (childProcess) {
      childProcess.stdout.on('data', function (data) {
        winston.info(data.toString().trim());
      });
      childProcess.stderr.on('data', function (data) {
        winston.info(data.toString().trim());
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
          winston.info('creating symlink for plugin ' + module.name + ' to directory ' + module.dir);
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
var includeFiles = function(bookPath, files) {
  var promises = files.map(function(file){
    var fullFilePath = path.join(bookPath, file.path);
    var dirname = path.dirname(fullFilePath);
    return Q.nfcall(mkdirp, dirname)
      .then(function(){return Q.nfcall(fs.writeFile, fullFilePath, file.content);});
  });
  return Q.all(promises)
    .then(function(){return bookPath;});
};

// execute 'gitbook build /temp/path/to/generated/book'
var build = function(bookPath) {
  var command = ['build', bookPath];
  var gitbookVersion = process.env.GITBOOK_VERSION;
  if(gitbookVersion) {
    winston.info('Using gitbook version ' + gitbookVersion);
    command.push('--gitbook='  + gitbookVersion);
  }
  return runCommand(gitbookRunnablePath(), command)
    .then(function(){return bookPath;});
};

// traverse rendered book and return all html files found
var _readFiles = function(bookPath, extension) {
  var deferred = Q.defer();
  var find = finder(path.join(bookPath, '_book'));
  var pages = [];

  find.on('file', function (file, stat) {
    if(endsWith(file, extension)) {
      pages.push(file);
    }
  });
  find.on('end', function () {deferred.resolve(pages);});
  find.on('error', deferred.reject);
  return deferred.promise;
};

// traverse rendered book and return all html files found
var readFiles = function(bookPath) {
  var extensions = ['.html', '.css', '.js'];

  var promises = extensions.map(function(extension){
    return _readFiles(bookPath, extension);
  });

  return Q.all(promises);
};

// convert read html content, parse only <section> content (ignore header, navigation etc)
// TODO: make it configurable, if someone want to test other parts of generated pages
var processFiles = function(bookPath, files) {

  var promises = _.flatten(files).map(function(filename){
    return Q.nfcall(fs.readFile, filename, 'utf-8')
      .then(function(fileContent) {
        var result = {
          path : path.relative(path.join(bookPath, '_book'), filename)
        };
        if(endsWith(filename, '.html')) {
          var $ = cheerio.load(fileContent);
          result.$ = $;
          result.content = $('section').html().trim();
        } else {
          result.content = fileContent;
        }
        return Q.resolve(result);
    });
  });
  return Q.all(promises).then(function(results){

    // preserve backwards compatibility with array-like indexing of results
    var resultsObj = results.reduce(function(acc, val, idx){
      acc[idx] = val;
      return acc;
    }, {});

    resultsObj.get = function(filename) {
      var found = results.filter(function(item){
        return item.path == path.normalize(filename);
      });
      if(found.length > 0) {
        return found[0];
      }
      return null;
    };
    return resultsObj;
  });
};

// main entry point - generate book, install plugins, attach local modules, read and transform html pages
var execute = function(htmlContent, bookJson, localModules, files, pages) {
  winston.level = process.env.DEBUG ? 'debug' : 'warn';

  var that = this;

  var modules = preprocessLocalModules(localModules);

  return createBook(htmlContent, pages)
    .then(function(bookPath) {
      return attachLocalPlugins(bookPath, modules)
        .then(installBookJson.bind(that, bookPath, bookJson, modules, false))
        .then(install.bind(that, bookPath))
        .then(installBookJson.bind(that, bookPath, bookJson, modules, true))
        .then(includeFiles.bind(that, bookPath, files))
        .then(build.bind(that, bookPath))
        .then(readFiles.bind(that, bookPath))
        .then(processFiles.bind(that, bookPath));
    });
};

function Builder() {
  this._modules = [];
  this._files = [];
  this._pages = [];
}

// attach Markdown content to book (currently only to README.md - single page book)
Builder.prototype.withContent = function(content) {
    this._content = content;
    return this;
};

// attach Markdown content to book (currently only to README.md - single page book)
Builder.prototype.withPage = function(name, content) {
    this._pages.push({name:name, content:content});
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

Builder.prototype.withFile = function(path, content) {
  this._files.push({path:path, content:content});
  return this;
};

// start build, return promise with processed html content of pages
Builder.prototype.create = function() {
  return execute(this._content, this._bookJson, this._modules, this._files, this._pages);
};

module.exports = {
  builder: function() {return new Builder();},
};
