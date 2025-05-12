# HoloStream - WebRTC Video Conferencing App

HoloStream is a real-time video conferencing application built with React Native and WebRTC, featuring peer-to-peer video calls with manual signaling.

## Features

- Create and join video rooms with unique room codes
- Real-time peer-to-peer video and audio streaming
- Camera and microphone controls
- Room code sharing
- Cross-platform support (iOS & Android)

## Technical Architecture

### Signaling Process

HoloStream uses Firebase Firestore for signaling, implementing a manual WebRTC signaling process:

1. **Room Creation (Broadcaster)**
   - Generates a unique 4-digit room code
   - Creates a room document in Firestore
   - Initializes participant status
   - Creates peer connection
   - Generates and stores offer in Firestore

2. **Room Joining (Viewer)**
   - Enters room code
   - Retrieves broadcaster's offer from Firestore
   - Creates peer connection
   - Generates and stores answer in Firestore
   - Establishes WebRTC connection

3. **ICE Candidate Exchange**
   - Both peers collect ICE candidates
   - Store candidates in Firestore
   - Exchange candidates through Firestore
   - Add candidates to peer connections

### Setup Instructions

1. **Prerequisites**
   ```bash
   Node.js >= 14
   React Native development environment
   iOS: XCode
   Android: Android Studio
   ```

2. **Installation**
   ```bash
   # Clone the repository
   git clone [https://github.com/RameeshKp/Holostream.git]
   cd HoloStream

   # Install dependencies
   npm install

   # iOS setup
   cd ios
   pod install
   cd ..
   ```

3. **Firebase Configuration**
   - Create a Firebase project
   - Enable Firestore
   - Add your Firebase configuration to the app
   - Set up Firestore security rules



4. **Running the App**
   ```bash
   # iOS
   npm run ios

   # Android
   npm run android
   ```

## WebRTC Configuration

The app uses the following STUN servers for NAT traversal:
```javascript
{
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
}
```

## Room Management

- Rooms are created with a unique 4-digit code
- Room status is tracked in Firestore
- Rooms become inactive when the broadcaster ends the call
- Participant status (camera/audio) is synchronized across peers

## Security Considerations

- Room codes are randomly generated
- Firestore security rules should be configured to:
  - Allow read/write access only to active rooms
  - Validate room status before allowing connections
  - Clean up inactive rooms and their data

## Troubleshooting

1. **Connection Issues**
   - Check internet connectivity
   - Ensure Firebase configuration is correct

2. **Media Access**
   - Grant camera and microphone permissions
   - Check device settings for app permissions

3. **Room Joining**
   - Verify room code is correct
   - Ensure room is active
   - Check Firestore connectivity


