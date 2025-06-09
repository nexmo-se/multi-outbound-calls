'use strict'

//-------------

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const fs = require('fs');

const axios = require('axios');
const request = require('request'); // will be later converted to axios

//-- CORS - update as needed for your environment -
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    // res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
    res.header("Access-Control-Allow-Methods", "GET,POST");
    res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
    next();
});

//--

app.use(bodyParser.json());

//------------------------------

const appId = process.env.APP_ID;
const serviceNumber = process.env.SERVICE_NUMBER;
const apiRegion = process.env.API_REGION;
const dc = apiRegion.substring(4, 8);

// ------------------

console.log("Service phone number:", serviceNumber);

//-------------------

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: appId,
  privateKey: './.private.key'
});

const apiBaseUrl = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiBaseUrl
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

const privateKey = fs.readFileSync('./.private.key');

const { tokenGenerate } = require('@vonage/jwt');

//-- Multi-call parameters --

const cps = Number(process.env.CPS);
const addedDelay = Number(process.env.ADDED_DELAY);

const interCallInterval = Math.ceil(1000 / cps) + addedDelay; // in ms

const maxRingDuration = Math.min( Number(process.env.MAX_RING_DURATION), 60 ); // 60 sec max

//-- Multi-call dictionary --

let multiCall = {};

//--

function addToMultiCall(info) {

  multiCall[info[0]] = multiCall[info[0]] ?? {};
  multiCall[info[0]]["legs"] = multiCall[info[0]]?.["legs"] ?? new Set();
  multiCall[info[0]]["legs"].add(info[1]);
  multiCall[info[0]]["answered"] = false;

  console.log("multiCall dictionary:", multiCall);
}  

//--

function removeFromMultiCall(info) {
  
  if (multiCall.hasOwnProperty(info[0])) {

    multiCall[info[0]]["legs"]?.delete(info[1]);

    if (multiCall[info[0]]["legs"].size == 0)  {
      delete multiCall[info[0]];
    }

  }  
  
  console.log("multiCall dictionary:", multiCall); 
}

//- test
// addToMultiCall(['111', '222']);
// addToMultiCall(['111', '333']);
// addToMultiCall(['444', '555']);
// removeFromMultiCall(['111', '333']);
// removeFromMultiCall(['111', '222']);

//-- List of allowable client SDK (WebRTC client) users --

const clientList = process.env.CLIENT_SDK_USERS.toLowerCase().split(/\s*,+\s*/);

let clients = new Set();

for (let client in clientList){
  clients.add(clientList[client]);
};

console.log('List of allowable client SDK names:', clients);

// create IVR voice prompts for PSTN incoming calls, the following example assumes
// you did specify more than 1 and up to 9 allowable client SDK user names (in .env file)

let ivrPrompt = "Welcome to our company. ";

let index = 0;
for (let client of clients) {
  index++;
  ivrPrompt = ivrPrompt + `To speak to ${client}, press ${index}. `;
};

// console.log('>>> IVR prompt:', ivrPrompt);

const clientsArray = Array.from(clients);

// no IVR for direct in-app to in-app calls (WebRTC client to WebRTC client)

//---- Sample call groups -----

const callGroup1 = [
  {
    type: process.env.ENDPOINT11_TYPE,
    destination: process.env.ENDPOINT11_DESTINATION
  },
  {
    type: process.env.ENDPOINT12_TYPE,
    destination: process.env.ENDPOINT12_DESTINATION
  },
  {
    type: process.env.ENDPOINT13_TYPE,
    destination: process.env.ENDPOINT13_DESTINATION
  }
];  

const callGroup2 = [
  {
    type: process.env.ENDPOINT21_TYPE,
    destination: process.env.ENDPOINT21_DESTINATION
  },
  {
    type: process.env.ENDPOINT22_TYPE,
    destination: process.env.ENDPOINT22_DESTINATION
  },
  {
    type: process.env.ENDPOINT23_TYPE,
    destination: process.env.ENDPOINT23_DESTINATION
  },
  {
    type: process.env.ENDPOINT24_TYPE,
    destination: process.env.ENDPOINT24_DESTINATION
  },
  {
    type: process.env.ENDPOINT25_TYPE,
    destination: process.env.ENDPOINT25_DESTINATION
  }
];

//==========================================================

const callPhone = async(host, type, to, from, peerUuid) => {

  console.log(Date.now(), 'placing call to', to);

  let status;

  switch(type) {

    case 'phone':

      await vonage.voice.createOutboundCall({
        to: [{
          type: 'phone',
          number: to
        }],
        from: {
          type: 'phone',
          number: from
          // number: toString(multiCall[peerUuid]["from"])
        },
        ringing_timer: maxRingDuration,
        answer_url: ['https://' + host + '/answer_multi?peer_uuid=' + peerUuid],
        answer_method: 'GET',
        event_url: ['https://' + host + '/event_multi?peer_uuid=' + peerUuid + '&in_app=false'],
        event_method: 'POST',
      })
      .then(resp => {
        console.log(Date.now(), '\ncalling phone number', to, resp);
        addToMultiCall([peerUuid, resp.uuid]); // add to the list of placed calls for incoming call (peer) uuid
        status = '200';
      })
      .catch(err => {
        console.log(err);              
        for (const s of Object.getOwnPropertySymbols(err.response)) {
          // console.log(s, err.response[s]);
          if (Object.hasOwn(err.response[s], "status")) {
            status = err.response[s].status.toString();;
          }
        }
      })

    break;

    case 'app':

      const accessToken = tokenGenerate(appId, privateKey, {});

      //-- call client SDK --
      request.post('https://api.nexmo.com/v2/calls', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            "content-type": "application/json",
        },
        body: {
          to: [{
            type: "app",
            user: to
          }],
          from: {
            type: 'phone',
            // number: toString(multiCall[uuid]["from"])
            number: from
            // type: 'sip',
            // uri: 'sip:a2345678901234567890@example.com'
            // type: 'app',
            // user: 'sarah'
          },
          ringing_timer: maxRingDuration,
          answer_url: ['https://' + host + '/answer_multi?peer_uuid=' + peerUuid],
          answer_method: 'GET',
          event_url: ['https://' + host + '/event_multi?peer_uuid=' + peerUuid + '&in_app=true'],
          event_method: 'POST'
          },
          json: true  
        }, function (error, response, body) {
          if (error) {
            // console.log(Date.now(), 'error calling client SDK', to, error.body, error.body.invalid_parameters)
             console.log(Date.now(), 'error calling client SDK', to, error)
          }
          else {
            // console.log(Date.now(), 'calling client SDK', to, response);
            console.log(Date.now(), '\ncalling client SDK', to);
          }
        });

    break;

    case 'sip':

      // TBD

    break;
    
    default:
      console.log('Unsupported call type:', type);

  }    

  return(status);

}

//----------------------------------------------------------

const callsToMake = new Set();

//-- test --
// const host1 = 'https://xxxxx.ngrok.io';
// const uuid = '12345';

// callGroup0.forEach(obj => {

//   // add to "callsToMake" set
//   // callsToMake.add({host, type, to, from, peeruuid});

//   // console.log(host1, obj.type, obj.destination, serviceNumber, uuid);

//   const legType = obj.type;
//   const legDestination = obj.destination;

//   callsToMake.add({host1, legType, legDestination, serviceNumber, uuid});

// });

//---------------------------------------------------------

setInterval( async() => {  // make next outbound calls

  const callInfo = callsToMake.values().next();

  if (callInfo.value) {

    console.log('\n>>> callInfo:',callInfo.value);

    const host = callInfo.value.host;
    const type = callInfo.value.type;
    const destination = callInfo.value.destination;
    const source = callInfo.value.source;
    const peer = callInfo.value.peer;

    callsToMake.delete(callInfo.value); // delete right away entry

    // place call
    const result = await callPhone(host, type, destination, source, peer)
    
    switch(result) {

    case '200':
      console.log('>> Started call to', type, 'destination', destination);
      break;

    case '429':    
      console.log('>> Call attempt to', type, 'destination', destination, 'returned status code 429, trying again now');
      // re-add to "callsToMake" Set
      callsToMake.add({'host': host, 'type': type, 'destination': destination, 'source': source, 'peer': peer});
      break;

    default:
      if (result) {
        console.log('>> Call attempt to', type, 'destination', destination, 'failed with status code', result);
      }
    
    }
    
  }

}, interCallInterval)

//----------------------------------------------------------

//- just display list of endpoints in a given call group

//- Group 1
console.log("\nCall group 1");

callGroup1.forEach(object => {
  console.log(object.type, object.destination);
});


//===============================================================================

app.get('/answer', async(req, res) => {

  const hostName = req.hostname;

  let nccoResponse;

  if (req.query.from_user) {  // is it a call from a client SDK (WebRTC client)?

    if (/^\d+$/.test(req.query.to)) { // is the "to" field value all digits? if yes, call that PSTN number

      nccoResponse = [
        {
          "action": "talk",
          "text": "Connecting your call, please wait",
          "language": "en-US",
          "style": 0
        },        
        {
          "action": "connect",
          "eventUrl": [`https://${req.hostname}/inappevent`], 
          "timeout": 45,
          "from": serviceNumber,
          "endpoint": [
            {
              "type": "phone",
              "number": req.query.to
            }
          ]
        }
      ];

      res.status(200).json(nccoResponse);

    } else {  // connect to another client SDK

      nccoResponse = [
        {
          "action": "talk",
          "text": "Connecting your call, please wait",
          "language": "en-US",
          "style": 0
        },
        { 
          "action": "connect", 
          "from": req.query.from,
          "endpoint": [ 
            { "type": "app", 
              "user": req.query.to
            }
          ],
          "timeout": 45,
          "eventUrl": [`https://${req.hostname}/inappevent`], 
          "eventMethod": "POST" 
        }
      ];

      res.status(200).json(nccoResponse);
        
    }  

  } else {  // this is the incoming call from outside

    const uuid = req.query.uuid;

    //- will be used for multi-call processing

    multiCall[uuid] = {};
    multiCall[uuid]["answered"] = false;  // will be used when placing multiple calls

    if (/^\d+$/.test(req.query.from)) { // is the from field all digits?

      multiCall[uuid]["from"] = req.query.from;

    } else {

      multiCall[uuid]["from"] = "000000000";  // no caller number for the incoming call
    
    }

    res.status(204).send('Accepted');

    //- play MoH ring back tone
    vonage.voice.streamAudio(uuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)

    //- start multi-call - using Group 1 as example
    callGroup1.forEach(obj => {
      // add to "callsToMake" Set
      callsToMake.add({'host': hostName, 'type': obj.type, 'destination': obj.destination, 'source': serviceNumber, 'peer': uuid});
    });

    //- check after ring time out if any callee has answered, if not terminate this incoming call
    setTimeout( () => {

      if ( multiCall.hasOwnProperty(uuid) && multiCall[uuid].hasOwnProperty("answered") ) {

        if (!multiCall[uuid]["answered"]) {

          // stop MoH ring back tone
          vonage.voice.stopStreamAudio(uuid);

          // play announcement
          vonage.voice.playTTS(uuid,  
            {
            text: 'Noone is available to take your call, please try again later',
            language: 'en-US', 
            style: 11
            })
            .then(res => console.log("Play TTS on:", uuid, res))
            .catch(err => console.error("Failed to play TTS on:", uuid, err));

          // terminate incoming call
          setTimeout( () => {

            vonage.voice.hangupCall(uuid)
              .then(res => console.log(">>> No call answer - Terminating inbound leg", uuid))
              .catch(err => null) // Inbound leg has already terminated
          
          }, 4000); // set to duration of above TTS

        }

      }

    }, maxRingDuration * 1000 + 3000); // 3000 ms margin to avoid race condition

  };  

});

//--------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  const uuid = req.body.uuid;

  // incoming call ended?
  if (req.body.status == 'completed' &&  multiCall.hasOwnProperty(uuid)) {

    // terminate all pending peer outbound calls
    for (const outboudLegUuid of multiCall[uuid]["legs"]) {

      console.log("hang up outbound leg", outboudLegUuid);

      vonage.voice.getCall(outboudLegUuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(outboudLegUuid)
              .then(res => console.log(">>> Terminating outbound leg", outboudLegUuid))
              .catch(err => null) // Outbound leg has already terminated
          }
         })
        .catch(err => console.error(">>> error get call status of outbound leg ", outboudLegUuid, err))   

      removeFromMultiCall([uuid, outboudLegUuid]);

    }

  }
  
});

//--------

app.post('/inappevent', (req, res) => {

  res.status(200).send('Ok');
  
});

//--------

app.get('/answer_multi', (req, res) => {

  const peerUuid = req.query.peer_uuid;

  if (multiCall.hasOwnProperty(peerUuid)) {

    if (multiCall[peerUuid]["answered"]) {  // has the call already been answered elswhere ?

      const nccoResponse = [
        {
          "action": "talk",
          "text": "The call has already been answered elsewhere, good bye.",
          "language": "en-US",
          "style": 0
        }
      ];

      res.status(200).json(nccoResponse); // play TTS and call terminates by itself

    } else {

      multiCall[peerUuid]["answered"] = true; // set flag to true

      // remove self from list of calls
      // removeFromMultiCall(peerUuid, req.query.uuid);

      const nccoResponse = [
        {
          "action": "talk",
          "text": "You have a call from a customer, you may speak now.",
          "language": "en-US",
          "style": 0
        },
        {
          "action": "conversation",
          "name": "conf_" + peerUuid,
          "startOnEnter": true,
          "endOnExit": true
        }
      ];

      res.status(200).json(nccoResponse); // this leg is now connected with the peer incoming call

    }; 

    // terminate all other initiated calls
    for (const outboudLegUuid of multiCall[peerUuid]["legs"]) {

      if (outboudLegUuid != req.query.uuid) { // don't terminate self

        console.log("hang up outbound leg", outboudLegUuid);

        vonage.voice.getCall(outboudLegUuid)
          .then(res => {
            if (res.status != 'completed') {
              vonage.voice.hangupCall(outboudLegUuid)
                .then(res => console.log(">>> Terminating outbound leg", outboudLegUuid))
                .catch(err => null) // Outbound leg has already terminated
            }
           })
          .catch(err => console.error(">>> error get call status of outbound leg ", outboudLegUuid, err))   

        removeFromMultiCall([peerUuid, outboudLegUuid]);

      }  

    }

  } else { 

    const nccoResponse = [
      {
        "action": "talk",
        "text": "The call has already been answered elsewhere, good bye.",
        "language": "en-US",
        "style": 0
      }
    ];

    res.status(200).json(nccoResponse); // play TTS and call terminates by itself

  }  

});

//--------

app.post('/event_multi', (req, res) => {

  res.status(200).send('Ok');

  const peerUuid = req.query.peer_uuid;

  //-- add the in-app leg uuid to the list of calls related to the peer incoming call uuid

  if ( req.query.in_app == "true" && (req.body.status == 'started' || req.body.status == 'ringing') ) {

    addToMultiCall([peerUuid, req.body.uuid]);

  }

  //-- one of the multiple simultaneoulsy called parties answered first the call 

  if (req.body.type == "transfer") {  // incoming call has been effectively added to the named conference

    // stop ring back tone MOH on the incoming call leg
    vonage.voice.stopStreamAudio(peerUuid);

    // put incoming call leg into same conference
    const ncco =
      [
        {
          "action": "conversation",
          "name": "conf_" + peerUuid,
          "startOnEnter": true,
          "endOnExit": true
        }
      ];

    vonage.voice.transferCallWithNCCO(peerUuid, ncco)
    .then(res => console.log(">>> adding incoming call", peerUuid, "to conference"))
    .catch(err => console.error(">>> adding incoming call to conference error:", uuid, err))

  }

  //-- remove self from list of multi-call uuids

  if (req.body.status == "completed") {

    removeFromMultiCall([req.query.peer_uuid, req.body.uuid]);

  }  
  
});

//--------

app.post('/rtc', (req, res) => {

  res.status(200).send('Ok');
  
});

//=== Services for the WebRTC client (Vonage client SDK) ===============

app.post('/login', async (req, res) => {

    const user = req.body.user; // web page should have already made the name to lower case

    // check if user is in the list of allowable users
    if (!clients.has(user)) {
      return res.status(401).json({ name: user, message: ">>> Unknown user" });
    }

    // either get or create this user (if not yet existing)
    const userId = await getUser(user);
    
    console.log("Generating JWT for user: " + user);
    const jwt = await generateJWT(user);
        
    return res.status(200).json({ name: user, userId: userId, token: jwt, dc: dc, phone: serviceNumber });
})

//--------

async function getUser(name) {
    
  const accessToken = tokenGenerate(appId, privateKey, {});
  
  return new Promise(async (resolve, reject) => {
    
    let results;
    
    try {
      results = await axios.get('https://api.nexmo.com/v0.3/users?name=' + name,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            }
        });

      //-- debug
      // console.log(">>> results.data:", results.data);
      // console.log("User Retrieval results: ", results.data._embedded.users[0].id);
      
      // If user already exists, just use it!
      resolve(results.data._embedded.users[0].id);
      return;
    } 
    catch (err) {

        console.log(">>> err.response:", err.response);
        // console.log("User retrieval error: ", err.response.data)
    }
    
    // Here - user does NOT exist, create it
    try {
        let body = {
            name: name,
            display_name: name
        }
        results = await axios.post('https://api.nexmo.com/v0.3/users', body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            });
        console.log("User creation results: ", results.data);
        
        // New user created, pass back the id
        resolve(results.data.id);
        
        return;
    } 
    catch (err) {
        console.log(">>> User creation error:", err);
        console.log("User creation error: ", err.response?.statusText)
        
        resolve(null);
    }
  })

}

//--------

app.post('/logout', async (req, res) => {
    
    let user = req.body.user;
    let session = req.body.session;
    
    console.log("Deleting session: " + session);
    await delSession(session);

    return res.status(200).end();
})

//--------

async function generateJWT(sub) {
    
    // Generate a JWT with the appropriate ACL
    let jwtExpiration = Math.round(new Date().getTime() / 1000) + 2592000; //30 days
    
    const aclPaths = {
        "paths": {
            "/*/users/**": {},
            "/*/conversations/**": {},
            "/*/sessions/**": {},
            "/*/devices/**": {},
            "/*/image/**": {},
            "/*/media/**": {},
            "/*/applications/**": {},
            "/*/push/**": {},
            "/*/knocking/**": {},
            "/*/legs/**": {}
        }
    }
    let claims = {
        exp: jwtExpiration,
        //ttl: 86400,
        acl: aclPaths,
    }
    
    // ONLY Client JWTs use a "sub", so don't add one if it is already passed in
    if (sub != null) {
        claims.sub = sub
    }
    
    // console.log(appId, privateKey, claims);
    
    const jwt = tokenGenerate(appId, privateKey, claims)
    
    // console.log("Jwt: ", jwt)
    
    return (jwt);
}

//--------

async function delSession(session) {

  const accessToken = tokenGenerate(appId, privateKey, {});
  
  return new Promise(async (resolve, reject) => {

    let results;

    try {
      results = await axios.delete('https://api.nexmo.com/v0.3/sessions/' + session,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
          }
        });
      // console.log("User session deletion results: ", results.data);
      resolve(results.data);
      return;
    } 
    catch (err) {
      console.log("User session deletion error: ", err)
    }
  })

}

//--------------- for VCR ----------------

app.get('/_/health', async (req, res) => {
   
  res.status(200).send('Ok');

});

//========== Static HTTP server ===========

app.use ('/', express.static(__dirname + '/public')); // static web server

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`\nApplication listening on port ${port}`));

//------------
