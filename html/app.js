(function(){

    // UserMedia

    var userMedia = undefined;
    navigator.getUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia
    || navigator.msGetUserMedia;


    if(!navigator.getUserMedia){
        console.error("No getUserMedia Support in this Browser");
    }

    navigator.getUserMedia({
        audio:true
    }, function(stream){
        userMedia = stream;
    }, function(error){
        console.error("Could not get User Media: " + error);
    });

    if(window.location.protocol === 'file:'){
        $("#content").hide();
        $("#error").show();
        return;
    } else {
        $("#error").hide();
        // INIT
        Nuance.logger = {
            log: function(msg){
                LOG(msg, 'out');
            }
        };
        // TABS init
        var hash = window.location.hash;
        hash && $('ul.nav a[href="' + hash + '"]').tab('show');
        $(document).on('shown.bs.tab', function(event) {
          window.location.hash = $(event.target).attr('href');
        });
    }

    // State

    var isRecording = false;

    // Selectors

    var $content = $('#content');
    var $url = $('#url');
    var $appKey = $('#app_key');
    var $appId = $('#app_id');
    var $userId = $('#user_id');
    var $nluTag = $('#nlu_tag');
    var $language = $('#language');
    var $saveCreds = $("#save_creds");
    var $resetCreds = $("#reset_creds");
    var $useNlu = $("#use_nlu");
    var $ttsGo = $('#tts_go');
    var $ttsText = $('#tts_text');
    var $ttsDebug = $('#tts_debug_output');
    var $asrRecord = $('#asr_go');
    var $asrLabel = $('#asr_label');
    var $nluExecute = $('#nlu_go');
    var $asrViz = $('#asr_viz');
    var $asrDebug = $('#asr_debug_output');
    var $nluDebug = $('#nlu_debug_output');
    var $asrVizCtx = $asrViz.get()[0].getContext('2d');
    var $showHideToggle = $('#show-hide-credentials');

    $showHideToggle.on('click', function(){
        var cv = $("#credentials-view");
        if(cv.is(':visible')){
            $(this).text('Show');
        } else {
            $(this).text('Hide');
        }
        cv.toggle();
    });

    // Default options for all transactions

    var defaultOptions = {
        onopen: function() {
            console.log("Websocket Opened");
            $content.addClass('connected');
        },
        onclose: function() {
            console.log("Websocket Closed");
            $content.removeClass('connected');
        },
        onvolume: function(vol) {
            viz(vol);
        },
        onresult: function(msg) {
            LOG(msg, 'in');
            //console.log(msg);
            if(msg.transcriptions && msg.result_format=='rec_text_results'){
              console.log(msg.transcriptions[0]);
              $.ajax({
                  url: '/talk',
                  type: 'POST',
                  data: JSON.stringify(msg),
                  contentType: 'application/json; charset=utf-8',
                  dataType: 'json'
              });
            }
            
            if (msg.result_type === "NMDP_TTS_CMD" || msg.result_type === "NVC_TTS_CMD") {
                dLog(JSON.stringify(msg, null, 2), $ttsDebug);
                $ttsGo.prop('disabled', false);
            } else if (msg.result_type === "NVC_ASR_CMD") {
                dLog(JSON.stringify(msg, null, 2), $asrDebug);
            } else if (msg.result_type == "NDSP_ASR_APP_CMD") {
                if(msg.result_format === "nlu_interpretation_results") {
                    try{
                        dLog("interpretations = " + JSON.stringify(msg.nlu_interpretation_results.payload.interpretations, null, 2), $asrDebug);
                    }catch(ex){
                        dLog(JSON.stringify(msg, null, 2), $asrDebug, true);
                    }
                } else {
                    dLog(JSON.stringify(msg, null, 2), $asrDebug);
                }
                $nluExecute.prop('disabled', false);
            } else if (msg.result_type === "NDSP_APP_CMD") {
                if(msg.result_format === "nlu_interpretation_results") {
                    try{
                        dLog("interpretations = " + JSON.stringify(msg.nlu_interpretation_results.payload.interpretations, null, 2), $nluDebug);
                    }catch(ex){
                        dLog(JSON.stringify(msg, null, 2), $nluDebug, true);
                    }
                } else {
                    dLog(JSON.stringify(msg, null, 2), $nluDebug);
                }
                $nluExecute.prop('disabled', false);
            }
        },
        onerror: function(error) {
            LOG(error);
            console.error(error);
            $content.removeClass('connected');
            $([$nluExecute,$ttsGo]).prop('disabled', false);
        }
    };

    function createOptions(overrides) {
        var options = Object.assign(overrides, defaultOptions);
        options.appId = $appId.val();
        options.appKey = $appKey.val();
        options.userId = $userId.val();
        options.url = $url.val()
        return options;
    }

    // Text NLU

    function textNlu(evt){
        var options = createOptions({
            text: $("#nlu_text").val(),
            tag: $nluTag.val(),
            language: $language.val()
        });
        $nluExecute.prop('disabled', true);
        Nuance.startTextNLU(options);
    }
    $nluExecute.on('click', textNlu);

    // ASR / NLU

    function asr(evt){
        if(isRecording) {
            Nuance.stopASR();
            $asrLabel.text('RECORD');
        } else {
            cleanViz();
            var options = createOptions({
                userMedia: userMedia,
                language: $language.val()
            });

            if($useNlu.prop('checked')) {
                options.nlu = true;
                options.tag = $nluTag.val();
            }
            Nuance.startASR(options);
            $asrLabel.text('STOP RECORDING');
        }
        isRecording = !isRecording;
    }
    $asrRecord.on('click', asr);

    // TTS

    function tts(evt){
        var options = createOptions({
            language: $language.val(),
            voice: TTS_VOICE,
            text: $ttsText.val()
        });
        $ttsGo.prop('disabled', true);
        Nuance.playTTS(options);
    }
    $ttsGo.on('click', tts);

    // ASR volume visualization

    window.requestAnimFrame = (function(){
        return  window.requestAnimationFrame       ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame    ||
                function(callback, element){
                    window.setTimeout(callback, 1000 / 60);
                };
    })();

    var asrVizData = {};
    function cleanViz(){
        var parentWidth = $asrViz.parent().width();
        $asrViz[0].getContext('2d').canvas.width = parentWidth;
        asrVizData = {
            w: parentWidth,
            h: 256,
            col: 0,
            tickWidth: 0.5
        };
        var w = asrVizData.w, h = asrVizData.h;
        $asrVizCtx.clearRect(0, 0, w, h); // TODO: pull out height/width
        $asrVizCtx.strokeStyle = '#333';
        var y = (h/2) + 0.5;
        $asrVizCtx.moveTo(0,y);
        $asrVizCtx.lineTo(w-1,y);
        $asrVizCtx.stroke();
        asrVizData.col = 0;
    }

    function viz(amplitudeArray){
        var h = asrVizData.h;
        requestAnimFrame(function(){
            // Drawing the Time Domain onto the Canvas element
            var min = 999999;
            var max = 0;
            for(var i=0; i<amplitudeArray.length; i++){
                var val = amplitudeArray[i]/asrVizData.h;
                if(val>max){
                    max=val;
                } else if(val<min){
                    min=val;
                }
            }
            var yLow = h - (h*min) - 1;
            var yHigh = h - (h*max) - 1;
            $asrVizCtx.fillStyle = '#1A6B96';
            $asrVizCtx.fillRect(asrVizData.col,yLow,asrVizData.tickWidth,yHigh-yLow);
            asrVizData.col += 1;
            if(asrVizData.col>=asrVizData.w){
                asrVizData.col = 0;
                cleanViz();
            }
        });
    }
    cleanViz();


    // Helpers

    function setCredentialFields() {
        $url.val(localStorage.getItem("url") || URL || '');
        $appId.val(localStorage.getItem("app_id") || APP_ID || '');
        $appKey.val(localStorage.getItem("app_key") || APP_KEY || '');
        $userId.val(localStorage.getItem("user_id") || USER_ID || '');
        $nluTag.val(localStorage.getItem("nlu_tag") || NLU_TAG ||  '');
        $language.val(localStorage.getItem("language") || ASR_LANGUAGE || 'eng-USA');
    }
    setCredentialFields();

    $saveCreds.on('click', function() {
        localStorage.setItem("url", $url.val());
        localStorage.setItem("app_id", $appId.val());
        localStorage.setItem("app_key", $appKey.val());
        localStorage.setItem("user_id", $userId.val());
        localStorage.setItem("nlu_tag", $nluTag.val());
        localStorage.setItem("language", $language.val());
        alert("Saved");
    });
    $resetCreds.on('click', function() {
        localStorage.setItem("url", URL);
        localStorage.setItem("app_id", APP_ID);
        localStorage.setItem("app_key", APP_KEY);
        localStorage.setItem("user_id", USER_ID);
        localStorage.setItem("nlu_tag", NLU_TAG);
        localStorage.setItem("language", ASR_LANGUAGE);
        setCredentialFields();
    });

    var dLog = function dLog(msg, logger, failure){
        var html = '<pre>'+msg+'</pre>';
        var time = new Date().toISOString();
        if(failure){
            html = '<span class="label label-danger">Error ('+time+')</span>' + html;
        } else {
            html = '<span class="label label-success">Success ('+time+')</span>' + html;
        }
        logger.prepend(html);
    };

    var LOG = function LOG(msg, type){
        var html = "<pre>"+JSON.stringify(msg, null, 2)+"</pre>";
        var time = new Date().toISOString();
        if(type === 'in'){
            html = '<span class="label label-info"><<<< Incoming (' + time + ')</span>' + html;
        } else {
            html = '<span class="label label-primary">>>>> Outgoing (' + time + ')</span>' + html;
        }
        $("#logs_output").prepend(html);
    }

})();
