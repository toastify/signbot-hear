let Nuance = require('nuance');
let child_process = require('child_process');
let samples = require('../signbot-data/data').samples;

require('dotenv-safe').load();

let talker = child_process.fork('../signbot-talk/index');

//stream to Nuance

on("word", function(word){
  if(samples[word])
    talker.send(samples[word]);
});
