   /*
    * This sample is provided to help developers to write their own NCS access
    * libraries. This shows how to construct websockets messages/frames
    * containing NCS (Nuance Cloud Services) commands and arguments.
    * This example supports three types of requests:
    * 1. Text to Speech (TTS)
    * 2. Automatic Speech Recognition (ASR)
    * 3. Natural Language Processing (NLU)
    */

'use strict';

(function(root, factory){
    root.Nuance = factory(root, {});
}(this, function(root, N){

    //
    // COMPAT. CHECKS
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if(!AudioContext){
        throw "No WebAudio Support in this Browser";
    }
    if(!('WebSocket' in window)){
        throw "No WebSockets Support in this Browser";
    }
    navigator.getUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia
    || navigator.msGetUserMedia;
    if(!navigator.getUserMedia){
        console.log("No getUserMedia Support in this Browser");
    }

    var context = new AudioContext();

    var AudioSource = function AudioSource(ws, volumeCallback) {

        var bufferSize = 2048;
        var desiredSampleRate = 16000; // 16k up to server
        var bytesRecorded = 0;
        var audioInput;
        var analyserNode;
        var recordingNode;
        var channelData = [];

        var recording = false;
        var onendedHandler = undefined;

        var resampler = new Resampler(context.sampleRate,desiredSampleRate,1,2048);


        var bits = _malloc(Speex.types.SpeexBits.__size__);
        _speex_bits_init(bits);
        var encoder = _speex_encoder_init(_speex_lib_get_mode(1));
        var buffer_ptr = _malloc(320*2);
        var buffer = HEAP16.subarray(buffer_ptr/2, buffer_ptr/2+320);
        var out_buffer_ptr = _malloc(100);
        var out_buffer = HEAPU8.subarray(out_buffer_ptr, out_buffer_ptr+100);


        var encodeSpeex = function encodeSpeex(frame) {
            var offset = 0;

            var ret = [];
            var frame_offset = 0;
            while(frame_offset < frame.length){
                var size = Math.min(320-offset, frame.length-frame_offset);
                for(var i=0; i<size; i++){
                    buffer[offset+i] = frame[frame_offset+i] * 32767.0;
                }
                frame_offset += size;
                offset += size;
                if(offset<320){
                    break;
                }
                offset = 0;
                var status = _speex_encode_int(encoder,buffer_ptr,bits);
                var count = _speex_bits_nbytes(bits);
                status = _speex_bits_write(bits,out_buffer_ptr,count);
                status = _speex_bits_reset(bits);
                var out_frame = new Uint8Array(count);
                out_frame.set(out_buffer.subarray(0,count));
                ret.push(out_frame);
            }
            return ret;

        };


        this.start = function start(userMedia) {
            recording = true;
            audioInput = context.createMediaStreamSource(userMedia); //
            analyserNode = context.createAnalyser();
            recordingNode = context.createScriptProcessor(bufferSize, 1, 2);
            recordingNode.onaudioprocess = function onaudioprocess(evt){
                if(!recording) {
                    audioInput.disconnect(analyserNode);
                    analyserNode.disconnect(recordingNode);
                    recordingNode.disconnect(context.destination);
                    onendedHandler();
                    return;
                }

                var ch = evt.inputBuffer.getChannelData(0);
                var _ch = resampler.resampler(ch);
                channelData.push(_ch);
                bytesRecorded += _ch.length;
                var ampArray = new Uint8Array(analyserNode.frequencyBinCount);
                analyserNode.getByteTimeDomainData(ampArray);

                var encodedSpx = encodeSpeex(_ch); // Uint8Array
                encodedSpx.forEach(function(typedArray){
                    ws.send(typedArray.buffer);
                });

                volumeCallback(ampArray);
            };
            audioInput.connect(analyserNode);
            analyserNode.connect(recordingNode);
            recordingNode.connect(context.destination);
        };
        this.stop = function stop(onended){
            onendedHandler = onended;
            recording = false;
        };

        return this;
    };


    var AudioSink = function AudioSink() {

        var speexDecoder = new SpeexDecoder({mode: 1, bits_size:640});
        speexDecoder.init();

        var decodeSpeex = function decodeSpeex(data) {
            return speexDecoder.process(new Uint8Array(data));
        };

        this.play = function play() {
            var count = 0;
            this.queue.forEach(function(data){
                count += data.length;
            });

            var audioToPlay = new Float32Array(count);

            var offset = 0;
            this.queue.forEach(function(data){
                audioToPlay.set(data, offset);
                offset += data.length;
            });

            var source = context.createBufferSource();
            var audioBuffer = context.createBuffer(1, audioToPlay.length, 16000);
            audioBuffer.getChannelData(0).set(audioToPlay);
            source.buffer = audioBuffer;
            source.connect(context.destination);
            if (source.start) {
                source.start(0);
            } else {
                source.noteOn(0);
            }
        };

        this.start = function start() {
            this.queue = [];
        };

        this.enqueue = function enqueue(data) {
            var audioToPlay = decodeSpeex(data);
            this.queue.push(audioToPlay);
        }
    };

    var _ws = undefined;
    var _ttsTransactionId = 0;
    var _asrTransactionId = 1;
    var _nluTransactionId = 2;
    var _asrRequestId = 0;

    var _audioSource = undefined;
    var _audioSink = undefined;

    var _serviceUri = undefined;


    var connect = function connect(options) {
        options = options || {};
        _serviceUri = _url(options);

        if(_ws !== undefined) {
            return;
        }

        _ws = new WebSocket(_serviceUri);

        _ws.onopen = function(){
            var nav = window.navigator;
            var deviceId = [
                nav.platform,
                nav.vendor,
                nav.language
            ].join('_').replace(/\s/g,'');

            _sendJSON({
                'message': 'connect',
                'user_id': options.userId,
                'codec': options.codec || 'audio/x-speex;mode=wb',
                'device_id': deviceId,
                'phone_model': 'nuance_internal_mixjsapp',
                'phone_number': options.userId
            });

            options.onopen();
        };
        _ws.onmessage = function(msg) {
            var msgType = typeof(msg.data);
            switch (msgType) {
                case 'object':
                    _audioSink.enqueue(msg.data);
                    break;
                case 'string':
                    var msg = JSON.parse(msg.data);
                    if(msg.message == "volume") {
                       options.onvolume(msg.volume);
                    } else {
                       options.onresult(msg);
                    }
                    if(msg.message == "audio_begin") {
                        _audioSink.start();
                    }
                    if(msg.message == "audio_end") {
                        _audioSink.play();
                    }
                    if(msg.message == "query_end") {
                        disconnect();
                    }
                    break;
                default:
                    options.onresult(msg.data);
            }
        };

        _ws.binaryType = 'arraybuffer';
        _ws.onclose = options.onclose;
        _ws.onerror = options.onerror;


    };

    var disconnect =  function disconnect(){
        _sendJSON({
            'message': 'disconnect'
        });
        _ws = undefined;
    };


    /**
     *
     * @param options
     * - text
     * - tag
     * - language
     * - voice
     * - codec
     * - onopen
     * - onclose
     * - onresult
     */
    N.playTTS = function playTTS(options) {
        options = options || {};
        var _options = Object.assign({}, options);
        _options.onopen = function() {
            options.onopen();
            _audioSink = new AudioSink();

            options = options || {};
            _ttsTransactionId += 2;
            var _start = {
                'message': 'query_begin',
                'transaction_id': _ttsTransactionId,

                'command': 'NVC_TTS_CMD',
                'language': options.language || 'eng-USA',
                'codec': options.codec || 'audio/x-speex;mode=wb'
            };
            if(options.voice){
                _start['tts_voice'] = options.voice;
            }
            var _synthesize = {
                'message': 'query_parameter',
                'transaction_id': _ttsTransactionId,

                'parameter_name': 'TEXT_TO_READ',
                'parameter_type': 'dictionary',
                'dictionary': {
                    'audio_id': 789,
                    'tts_input': options.text || 'Text to speech from Nuance Communications',
                    'tts_type': 'text'
                }
            };
            var _end = {
                'message': 'query_end',
                'transaction_id': _ttsTransactionId
            };

            _sendJSON(_start);
            _sendJSON(_synthesize);
            _sendJSON(_end);
        };
        connect(_options);
    };

    /**
     *
     * @param options
     * - text
     * - tag
     * - language
     * - onopen
     * - onclose
     * - onresult
     */
    N.startTextNLU = function startTextNLU(options){
        options = options || {};
        var _options = Object.assign({}, options);
        _options.onopen = function() {
            options.onopen();
            var _tId = (_nluTransactionId + _asrTransactionId + _ttsTransactionId);
            _nluTransactionId += 1;

            var _query_begin = {
                'message': 'query_begin',
                'transaction_id': _tId,

                'command': 'NDSP_APP_CMD',
                'language': options.language || 'eng-USA',
                'context_tag': options.tag
            };

            var _query_parameter = {
                'message': 'query_parameter',
                'transaction_id': _tId,

                'parameter_name': 'REQUEST_INFO',
                'parameter_type': 'dictionary',

                'dictionary': {
                    'application_data': {
                        'text_input': options.text
                    }
                }
            };

            var _query_end = {
                'message': 'query_end',
                'transaction_id': _tId
            };

            _sendJSON(_query_begin);
            _sendJSON(_query_parameter);
            _sendJSON(_query_end);
        };
        connect(_options);
    };


    /**
     *
     * @param options
     * - usermedia
     * - tag
     * - language
     * - onopen
     * - onclose
     * - onvolume
     * - onresult
     */
    N.startASR = function startASR(options) {
        options = options || {};
        var _options = Object.assign({}, options);

        _options.onopen = function() {
            options.onopen();
            _asrTransactionId += 2;
            _asrRequestId++;

            var _query_begin = {
                'message': 'query_begin',
                'transaction_id': _asrTransactionId,

                'language': options.language || 'eng-USA',
                'codec': 'audio/x-speex;mode=wb' // 16k
            };
            if (options.nlu) {
                _query_begin.command = 'NDSP_ASR_APP_CMD';
                _query_begin.context_tag = options.tag;
            } else {
                _query_begin.command = 'NVC_ASR_CMD';
                _query_begin.recognition_type = options.tag || 'dictation';
            }

            var _request_info = {
                'message': 'query_parameter',
                'transaction_id': _asrTransactionId,

                'parameter_name': 'REQUEST_INFO',
                'parameter_type': 'dictionary',
                'dictionary': {
                    'start': 0,
                    'end': 0,
                    'text': ''
                }
            };
            var _audio_info = {
                'message': 'query_parameter',
                'transaction_id': _asrTransactionId,

                'parameter_name': 'AUDIO_INFO',
                'parameter_type': 'audio',

                'audio_id': _asrRequestId
            };
            var _query_end = {
                'message': 'query_end',
                'transaction_id': _asrTransactionId
            };
            var _audio_begin = {
                'message': 'audio',
                'audio_id': _asrRequestId
            };


            _sendJSON(_query_begin);
            _sendJSON(_request_info);
            _sendJSON(_audio_info);
            _sendJSON(_query_end);
            _sendJSON(_audio_begin);

            _audioSource = new AudioSource(_ws, function (volume) {
                options.onvolume(volume);
            });
            _audioSource.start(options.userMedia);
        };
        connect(_options);
    };

    N.stopASR = function stopASR() {
        _audioSource.stop(function() {
            var _audio_end = {
                'message': 'audio_end',
                'audio_id': _asrRequestId
            };
            _sendJSON(_audio_end);
        });
    };




    //Data Helpers

    var _sendJSON = function _sendJSON(json) {
        _ws.send(JSON.stringify(json));
        if(N.logger){
            N.logger.log(json);
        }
    };

    var _url = function _url(options){
        var serviceUri = options.url || N.DEFAULT_URL;
        var params = [];
        params.push('app_id=' + options.appId);
        params.push('algorithm=key');
        params.push('app_key=' + options.appKey);
        serviceUri += params.join('&');
        return serviceUri;
    };

    return N;

}));
