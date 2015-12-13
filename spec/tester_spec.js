var tester = require('../lib/tester');
var path = require('path');

jasmine.getEnv().defaultTimeoutInterval = 20000;
// process.env.DEBUG = true;

describe(__filename, function() {
  it('should create book and parse content', function(testDone) {
    tester.builder()
    .withContent('#test me \n\n![preview](preview.jpg)')
    .create()
    .then(function(result) {
      expect(result.get('index.html').content).toEqual('<h1 id="test-me">test me</h1>\n<p><img src="preview.jpg" alt="preview"></p>');
    })
    .fin(testDone)
    .done();
  });

  it('should create book with plugins and parse content', function(testDone) {
      tester.builder()
      .withContent('This text is {% em %}highlighted !{% endem %}')
      .withBookJson({"plugins": ["emphasize"]})
      .create()
      .then(function(result) {
        expect(result.get('index.html').content).toEqual('<p>This text is <span class="pg-emphasize pg-emphasize-yellow" style="">highlighted !</span></p>');
      })
      .fin(testDone)
      .done();
  });

  it('should add external resources and read them during build', function(testDone) {
      tester.builder()
      .withContent('This text is {% include "./includes/test.md" %}')
      .withFile('includes/test.md', 'included from an external file!')
      .create()
      .then(function(result) {
        expect(result.get('index.html').content).toEqual('<p>This text is included from an external file!</p>');
      })
      .fin(testDone)
      .done();
  });



});
