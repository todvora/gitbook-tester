# Gitbook integration tests framework

[![Build Status](https://travis-ci.org/todvora/gitbook-tester.svg?branch=master)](https://travis-ci.org/todvora/gitbook-tester)
[![Coverage Status](https://coveralls.io/repos/github/todvora/gitbook-tester/badge.svg?branch=master)](https://coveralls.io/github/todvora/gitbook-tester?branch=master)
[![npm version](https://badge.fury.io/js/gitbook-tester.svg)](https://badge.fury.io/js/gitbook-tester)
[![Dependencies Status](https://david-dm.org/todvora/gitbook-tester/status.svg)](https://david-dm.org/todvora/gitbook-tester/)
[![DevDependencies Status](https://david-dm.org/todvora/gitbook-tester/dev-status.svg)](https://david-dm.org/todvora/gitbook-tester/#info=devDependencies)

No more mocking of gitbook build! Verify your gitbook-plugin against real, up-to-date
version of gitbook. This integration framework creates temporary book, attaches your local gitbook plugin, runs gitbook build and returns parsed pages content.

All the book resources are generated and executed in a temporary directory (exact location
  depends on your operating system). Resources are cleaned up upon test phase.

## Usage

```js
var tester = require('gitbook-tester');
tester.builder()
  .withContent('This text is {% em %}highlighted !{% endem %}')
  .withBookJson({"plugins": ["emphasize"]})
  .create()
  .then(function(result) {
    // do something with results!
    console.log(result[0].content);
  });
```
Expected output is then:
```html
<p>This text is <span class="pg-emphasize pg-emphasize-yellow" style="">highlighted !</span></p>
```
Only ```<section>``` content of generated pages is currently returned. Do you need
to test also navigation, header of page or so? Let me know or send pull request.

Gitbook-tester package provides single entry point:

```js
tester.builder()
```

On the builder following methods can be called:

### .withContent(markdownString)
Put some **Markdown** content to the generated books README.md (initial/intro page).

### .withPage(pageName, pageContent[, level])
Add another book page. Usage like
```js
  .withPage('second', 'Second page content')
```
There is no need of specifying extension, ```.md``` will be automatically added.
The rendered page can be accessed later in tests like
```js
it('should add second book page', function(testDone) {
    tester.builder()
    .withContent('First page content')
    .withPage('second', 'Second page content')
    .create()
    .then(function(result) {
      expect(result.get('second.html').content).toEqual('<p>Second page content</p>');
    })
    .fin(testDone)
    .done();
});
```

**Level**: how nested should be this page, optional parameter. ```0``` for top level page, ```1``` for second, ```2``` for third... 

### .withBookJson(jsObject)
Put your own ```book.json``` content as a JS object. May contain plugins,
plugin configuration or any valid as described in [official documentation](http://help.gitbook.com/format/configuration.html).
Can be omitted.

### .withLocalPlugin(path)
Attach currently tested or developed plugin to generated gitbook. All locally attached plugins will be automatically added
 to ```book.json``` in ```plugins``` section.

Should be called
in form
```js
.withLocalPlugin('/some/path/to/module')
```
If you run your tests from dir ```spec``` of your plugin, you should provide
path to root of your plugin module. For example
```js
.withLocalPlugin(require('path').join(__dirname, '..'))
```

### .withFile(path, content)
Allows to create a file inside book directory. You just provide path for the file and string content:

```js
.withFile('includes/test.md', 'included from an external file!')
```
Then you can use the file anyhow in your plugin or simply include its content in a page:

```
'This text is {% include "./includes/test.md" %}'
```

### .create()
Start build of the book. Generates all the book resources, installs required
plugins, attaches provided local modules. Returns ```promise```.


## Working with results

```js
.then(function(result) {
  var index = result.get('index.html');
  console.log(index);  
})
```
should output JavaScript object like
```js
{ path: 'index.html',
  '$': [cheerio representation of the page]
  content: '<h1 id="test-me">test me</h1>' }

```

## Force a specific gitbook version
You can test your plugin against a specific gitbook version by providing ENV variable like ```GITBOOK_VERSION=2.6.7```. This could be used for example in [Travis-CI build matrix](https://docs.travis-ci.com/user/customizing-the-build/#Build-Matrix).

## Debugging
If you wish to see detailed output of the build and gitbook logs itself, provide ENV variable ```DEBUG=true```.

## Complete test example
How to write simple test, using node-jasmine.
```js

var tester = require('gitbook-tester');

// set timeout of jasmine async test. Default is 5000ms. That can
// be too low for complete test (install, build, expects)
jasmine.getEnv().defaultTimeoutInterval = 20000;

describe("my first gitbook integration test", function() {
  it('should create book and parse content', function(testDone) {
    tester.builder()
    .withContent('#test me \n\n![preview](preview.jpg)')
    .create()
    .then(function(result) {
      expect(result[0].content).toEqual('<h1 id="test-me">test me</h1>\n<p><img src="preview.jpg" alt="preview"></p>');
    })
    .fin(testDone)
    .done();
  });
});
```
