# Ring multiple PSTN and WebRTC endpoints to answer an incoming call

On a incoming call, multiple PSTN and/or WebRTC endpoints are called, the first one to answer gets connected to the incoming call, all other called endpoints stop ringing.

This repository includes a sample WebRTC client code in JavaScript using the Vonage Client SDK, as well as the corresponding sample server code.

Using a WebRTC client is also known as in-app voice.

The sample code here allows a WebRTC client to receive calls from PSTN, to make calls to PSTN, and make or receive calls with another WebRTC client.

There are two implementation variants:

First variant:
- There is no IVR nor Voice AI interaction for the caller, multiple PSTN and/or WebRTC users are called, the first one to answer gets connected to the caller, all other callees stop ringing,
- For the caller, call duration timer starts only when a callee answers, in other words the caller's phone shows that the call is "answered" only when a callee answers the call,
- If noone answers after the ring time out, the ringing incoming call is terminated, and all callees stop ringing too,
- This variant is also known as "Early media",
- This variant is handled by the sample server code<br>
`multi-outbound-calls-early-media.js`.

Second variant:
- There is IVR or Voice AI interaction for the caller,
- For the caller, call duration timer starts when the IVR or the Voice AI answers the call, in other words the caller's phone shows that the call is "answered" from the get go so the caller can interact with an IVR or Voice AI,
- Then if a call transfer to a live agent is needed, multiple PSTN and/or WebRTC users are called, the first one to answer gets connected to the caller, all other callees stop ringing,
- If noone answers after the ring time out, the established incoming call is terminated, and all callees stop ringing,
- This variant is handled by the sample server code<br>
`multi-outbound-calls-ivr-voice-ai-interaction.js`.

First variant - With call whisper:
- It has the same capabilities as described in "First variant" section above
- Once the incoming call (e.g. customer call leg) is connected with an outgoing call (e.g. agent call leg), you may add a third call leg that can hear both the customer and the agent, and only the agent leg can hear audio from that third call leg, this is a.k.a. call whispering, or call coaching.
- The third call leg may end at any time, while the first and second call legs stay connected.
- This variant is handled by the sample server code<br>
`multi-outbound-calls-early-media-coach.js`.

## Set up

### Local deployment using ngrok

If you plan to test using `Local deployment with ngrok` (Internet tunneling service), here are the instructions to set up ngrok:<br>
- [Install ngrok](https://ngrok.com/download),<br>
- Make sure you are using the latest version of ngrok and not using a previously installed version of ngrok,
- Sign up for a free [ngrok account](https://dashboard.ngrok.com/signup),<br>
- Verify your email address from the email sent by ngrok,<br>
- Retrieve [your Authoken](https://dashboard.ngrok.com/get-started/your-authtoken),<br>
- Run the command `ngrok config add-authtoken <your-authtoken>`<br>
- Set up the tunnel
	- Run `ngrok config edit`
		- For a free ngrok account, add following lines to the ngrok configuration file (under authoken line):</br>
		<pre><code>	
		tunnels:
			mytunnel:</br>
				proto: http</br>
				addr: 8000</br>
		</code></pre>
		- For a [paid ngrok account](https://dashboard.ngrok.com/billing/subscription), you may set a ngrok hostname that never changes on each ngrok new launch, add following lines to the ngrok configuration file (under authoken line) - set hostname to actual desired values:</br>
		<pre><code>	
		tunnels:
			mytunnel:</br>
				proto: http</br>
				addr: 8000</br>
				hostname: setahostnamehere.ngrok.io</br>
		</code></pre>			
		
- Start the ngrok tunnel
	- Run `ngrok start mytunnel`</br>
	- You will see lines like
		....</br>
		*Web Interface                 http://127.0.0.1:4040</br>                             
		Forwarding                    https://xxxxxx.ngrok.io -> http://localhost:8000*</br> 
	- Make note of *https://xxxxxx.ngrok.io* (with the leading https://), as it will be needed in the next steps below.</br>	

Reminder: The Node.js server application (this repository) is running on local port 8000.</br>

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://ui.idp.vonage.com/ui/auth/login) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage API account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under **Capabilities** section (click on [Edit] if you do not see this section):

Enable Voice
- Under Answer URL, leave HTTP GET, and enter https://\<host\>:\<port\>/voice/answer (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running), e.g.</br>
*https://xxxxxx.ngrok.io/voice/answer*</br>
or
*https://myserver2.mycompany.com:40000/voice/answer*</br>
- Under Event URL, **select** **_HTTP POST_**, and enter https://\<host\>:\<port\>/voice/event (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running), e.g.</br>
*https://xxxxxx.ngrok.io/voice/event*</br>
or
*https://myserver2.mycompany.com:40000/voice/event*</br>

- Click on [Generate public and private key] if you did not yet create or want new ones, then save as **.private.key** file (note the leading dot in the file name) in this application folder.</br>
**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>
- Link a phone number to this application if none has been linked to the application.

Please take note of your **application ID** and a **linked phone number** (as they are needed in the very next section.)

Note: You may have more than one phone number linked to your application if needed.

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- A **`phone number linked`** to your application (as **`SERVICE_NUMBER`**), external parties will **call that number**.</br>

### Set up the server application

Copy or rename env-example to .env<br>

Update parameters in .env file<br>

There are two sample multi-call groups, both server variants use the "Sample Call Group number 1", you may update that group in .env file for your initial tests.<br>
You may add/remove `phone` (PSTN phone number), or `app` (WebRTC, client SDK user name) type endpoints in a given group.<br>

For a given multi-call group, e.g. multi-call group 1, to match what is in the .env file,<br>

for the first variant, update accordingly in the program file `multi-outbound-calls-early-media.js`, see:<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-early-media.js#L145-L158<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-early-media.js#L357-L362<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-early-media.js#L451-L452<br>

or for the second variant, update accordingly in the program file `multi-outbound-calls-ivr-voice-ai-interaction.js`, see:<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-ivr-voice-ai-interaction.js#L146-L159<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-ivr-voice-ai-interaction.js#L359-L364<br>
https://github.com/nexmo-se/multi-outbound-calls/blob/master/multi-outbound-calls-ivr-voice-ai-interaction.js#L489-L490<br>

you may update that group 1 for your initial tests.

In actual production, the list of PSTN and/or WebRTC endpoints may come from your own database depending on the time of the day, on the availability of live attendants, and other business factors you may have.

Update other parameters in .env file accordingly.

Have Node.js installed on your system, this application has been tested with Node.js version 18.19.1<br>

Install node modules with the command `npm install`<br>

Start the server application with either the command<br>
`node multi-outbound-calls-early-media.js` (first variant)<br>
or <br>
`node multi-outbound-calls-ivr-voice-ai-interaction.js` (second variant)<br>
or <br>
`node multi-outbound-calls-early-media-coach.js` (first variant with call whispering).<br>

Either of these Node.js server applications (in this repository) is running on local port 8000.</br>

## WebRTC client

The sample WebRTC client in this repository is based on the Vonage Client SDK.</br>

Open it in a web browser using the address:</br>

https://myserver-address/client.html</br>

e.g.</br>
https://xxxxxx.ngrok.io/client.html</br>
or</br>
https://myserver.mycompany.com:40000/client.html</br>

You are ready to:</br>
- Receive PSTN calls,</br>
- Make PSTN calls from a WebRTC client,</br>
- Receive or place a call to/from another WebRTC client (opened from the same link - logged in as a different user).</br>

## Test multi-calls

Call in to the phone number listed as  **`SERVICE_NUMBER`** in .env file.</br>
It will ring the endpoints listed as Group 1 in .env file,</br>
first one to answer gets connected to the incoming call,</br>
all other endpoints stop ringing.

## Test call whispering

Once an incoming call (1st participant, e.g. customer) is connected to an outgoing call (2nd participant, e.g. agent),
connect a third call that can listen to both initial participants and do whispering to the 2nd participant by accessing either of the following URLs (via a web browser or programmatically with HTTP GET).

To connect a PSTN listener/whisperer endpoint:</br>
`https://<server>/coachpstn?number=<number_to_call>&uuid=<2nd_participant_uuid>`</br></br>
e.g.
`https://xxxxx.ngrok.io/coachpstn?number=12995550101&uuid=bc26bafd-e361-4369-a3d7-4b85756ad70b`</br></br>


To connect a WebRTC (aka Client SDK) listener/whisperer endpoint:</br>
`https://<server>/coachapp?user=<client-sdk-user-name>&uuid=<2nd_participant_uuid>`</br></br>
e.g.
`https://xxxxx.ngrok.io/coachapp?user=jennifer&uuid=ad26bafd-e361-4369-a3d7-4b85756ad7fa`

