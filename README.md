# HoloStream Video Call App

A React Native video calling application that uses WebRTC for peer-to-peer video communication and Firebase for signaling.

## Features

- Real-time video and audio communication
- Support for multiple participants
- Room-based calling system
- Simple and intuitive user interface
- Cross-platform (iOS and Android)

## Prerequisites

- Node.js (v14 or later)
- React Native development environment set up
- Firebase project with Firestore enabled
- iOS: XCode (for iOS development)
- Android: Android Studio (for Android development)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd HoloStream
```

2. Install dependencies:
```bash
npm install
```

3. iOS specific setup:
```bash
cd ios
pod install
cd ..
```

4. Configure Firebase:
   - Create a new Firebase project
   - Enable Firestore
   - Add your iOS and Android apps to the Firebase project
   - Download and add the configuration files:
     - iOS: `GoogleService-Info.plist` to the iOS project
     - Android: `google-services.json` to the android/app directory

5. Update Firebase configuration:
   - For iOS: Update the Firebase configuration in `ios/Podfile`
   - For Android: Update the Firebase configuration in `android/app/build.gradle`

## Running the App

### iOS
```bash
npm run ios
```

### Android
```bash
npm run android
```

## Usage

1. Start a New Call:
   - Tap "Start New Call"
   - The app will generate a room ID
   - Share this room ID with participants

2. Join a Call:
   - Enter the room ID provided by the host
   - Tap "Join Call"

3. During the Call:
   - View local and remote video streams
   - Use the "Hang Up" button to end the call

## Permissions

The app requires the following permissions:
- Camera access
- Microphone access
- Internet connectivity

## Technical Details

- Built with React Native
- Uses react-native-webrtc for video/audio streaming
- Firebase Firestore for signaling
- Implements WebRTC peer connections
- Supports multiple concurrent connections

## Troubleshooting

1. Camera/Microphone not working:
   - Ensure permissions are granted
   - Check device settings
   - Restart the app

2. Connection issues:
   - Check internet connectivity
   - Verify room ID is correct
   - Ensure Firebase configuration is correct

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
