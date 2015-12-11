# Gitbook integration tests framework

[![Build Status](https://travis-ci.org/todvora/gitbook-tester.svg?branch=master)](https://travis-ci.org/todvora/gitbook-tester)
[![npm version](https://badge.fury.io/js/gitbook-tester.svg)](https://badge.fury.io/js/gitbook-tester)

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
Put some **Markdown** content to the generated book. Currently only single
page book supported (contains only README.md).

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
