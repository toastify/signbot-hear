let child_process = require('child_process');
let samples = require('../signbot-data/data').samples;
let request = require('request');
let randomstring = require('randomstring');

require('dotenv-safe').load();

let talker = child_process.fork('../signbot-talk/index');

var fs = require('fs');

let qs = require('querystring').stringify({
  appId: process.env.NUANCE_APP_ID,
  appKey: process.env.NUANCE_APP_KEY,
  id: randomstring.generate(10)
});

let queue = [];
let processing = false;

function processPositionQueue(){
  console.log(queue);
  processing = true;
  if(queue.length){
    let to_move = queue.shift();
    if(to_move){
      if(to_move[0]){
        queue = to_move.concat(queue);
        processPositionQueue();
      }
      else{
        talker.send(to_move);
        setTimeout(processPositionQueue, to_move.time || 3000);
      }
    }
    else{
      processPositionQueue();
    }
  }else{
    talker.send(samples['null']);
    processing = false;
  }
}

const express = require('express');
const bodyParser = require('body-parser');
let app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname + '/html'));
app.all('/talk', (req, res) => {
    if(req.body.transcriptions){
      console.log(req.body.transcriptions[0]);
      queue = queue.concat(req.body.transcriptions[0].split(' ').map(x=>samples[x]));
      if(!processing)processPositionQueue();
    }

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8022');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
  res.sendStatus(200);
});
app.listen(8022, function(){
  console.log('listening');
});
