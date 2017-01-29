# Nuance JavaScript Websocket Sample App

This sample is intended to demonstrate how to use the Nuance Websocket protocol in JavaScript.

You can perform 3 types of transactions with this protocol.
1. Text to Speech (TTS)
2. Automatic Speech Recognition (ASR)
3. Natural Language Processing (NLU)


## Configuration

### Credentials
You will need credentials to connect to perform any of the 3 transactions types.

You can either enter your Nuance Developer credentials into the Web App.

Or you may edit configuration.js:

```javascript
var URL = 'wss://ws.dev.nuance.com/?';
var APP_ID = undefined;  // "NMDPTRIAL_username1234567890"
var APP_KEY = undefined; // "e77b5c751b94dddefc7d34bb5a4c44dc62199b5fd762da761974e36db57acecfcda31c8ad47946ccdca1516fa73476ebb46117c9a7124baeeb6e"
var USER_ID = undefined; // "user.name@company.com"
```

You may find your credentials in the [Nuance Developers Portal](https://developer.nuance.com), under "My Apps"


### NLU Context Tag
You will need a service tag to perform NLU.

Your tag can be entered in the Web App.

Or you may edit the following line in configuration.js:

```javascript
var NLU_TAG = undefined; // "Project123_App456"
```

*Note if you leave the tag empty, ASR will still be performed without NLU.*

You can create versions of your NLU model and associate them to an application in [Mix.nlu](https://developer.nuance.com/mix/nlu), on the "Publish" tab within your model.

## Running

Do not simply open index.html in a web browser. You will need to access it through a web server.

If you need a simple web server to get running quickly, you can use Python's SimpleHTTPServer.

Run the following from this directory, to run a server on port 8000 (you can use another port if you wish).

Python 2.x
```bash
python -m SimpleHTTPServer 8000
```

Python 3.x
```bash
python -m http.server --cgi 8000
```

You can then open the page in your browser by navigating to:

[http://localhost:8000](http://localhost:8000)