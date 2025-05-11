import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
} from 'react-native';
import VideoCall from '../../components/VideoCall';
import firestore from '@react-native-firebase/firestore';
import { TOAST_TYPE } from '../../utils/Toast';
import { showToast } from '../../utils/Toast';
import { styles } from './styles';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * CallScreen Component
 * Main screen for managing video calls in HoloStream
 * 
 * Features:
 * - Create new video call rooms
 * - Join existing rooms using room codes
 * - Interactive tutorial for first-time users
 * - Room code sharing and copying
 * 
 * Flow:
 * 1. User can create a new room or join existing one
 * 2. Room code is generated/entered
 * 3. Video call is initiated with appropriate role (broadcaster/viewer)
 * 4. Tutorial overlay guides new users
 */
const CallScreen: React.FC = () => {
    // State for room management
    const [roomId, setRoomId] = useState(''); // Current room code
    const [roomDocID, setRoomDocID] = useState(''); // Firestore document ID
    const [isInCall, setIsInCall] = useState(false); // Call status
    const [isLoading, setIsLoading] = useState(false); // Loading state
    const [isBroadcaster, setIsBroadcaster] = useState(false); // User role
    const [showTutorial, setShowTutorial] = useState(false); // Tutorial visibility

    // AsyncStorage key for tutorial persistence
    const TUTORIAL_KEY = '@holostream_tutorial_shown';

    /**
     * Check if tutorial has been shown before
     * Shows tutorial only on first app launch
     */
    useEffect(() => {
        checkTutorialStatus();
    }, []);

    /**
     * Checks AsyncStorage for tutorial status
     * Shows tutorial if it hasn't been shown before
     */
    const checkTutorialStatus = async () => {
        try {
            const tutorialShown = await AsyncStorage.getItem(TUTORIAL_KEY);
            if (!tutorialShown) {
                setShowTutorial(true);
                await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
            }
        } catch (error) {
            console.error('Error checking tutorial status:', error);
        }
    };

    /**
     * Manually show tutorial overlay
     * Used when user clicks "See Instructions"
     */
    const handleShowTutorial = () => {
        setShowTutorial(true);
    };

    /**
     * Generates a random 4-digit room code
     * Used when creating new rooms
     */
    const generateRoomId = () => {
        return Math.floor(1000 + Math.random() * 9000).toString();
    };

    /**
     * Initiates a new video call as broadcaster
     * Creates new room with generated code
     */
    const startNewCall = () => {
        const newRoomId = generateRoomId();
        setRoomId(newRoomId);
        setIsBroadcaster(true);
        setIsInCall(true);
    };

    /**
     * Joins an existing video call as viewer
     * Validates room code and checks room status
     */
    const joinExistingCall = async () => {
        setIsLoading(true);
        if (!roomId.trim()) {
            setIsLoading(false);
            showToast(TOAST_TYPE.ERROR, 'Please enter a room ID');
            return;
        }

        try {
            // Query Firestore for active room
            const roomRef: any = firestore().collection('rooms');
            const roomDocs: any = (await roomRef.get())._docs;
            const activeRoom = roomDocs.find((doc: any) =>
                doc._data.roomId === roomId && doc._data.status === 'active'
            );

            if (!activeRoom) {
                setIsLoading(false);
                showToast(TOAST_TYPE.ERROR, 'Room does not exist or is not active');
                return;
            }

            setRoomDocID(activeRoom.id);
            setIsBroadcaster(false);
            setIsInCall(true);
        } catch (error) {
            console.error('Error checking room:', error);
            showToast(TOAST_TYPE.ERROR, 'Failed to join room');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Tutorial Overlay Component
     * Displays step-by-step instructions for using the app
     */
    const TutorialOverlay = () => (
        <Modal
            visible={showTutorial}
            transparent={true}
            animationType="fade"
        >
            <View style={styles.tutorialOverlay}>
                <View style={styles.tutorialContent}>
                    <Text style={styles.tutorialTitle}>Welcome to HoloStream!</Text>
                    <Text style={styles.tutorialText}>Here's how to use manual signaling:</Text>

                    <View style={styles.tutorialStep}>
                        <Text style={styles.tutorialStepNumber}>1</Text>
                        <Text style={styles.tutorialStepText}>Create a new room or join an existing one using the room code</Text>
                    </View>

                    <View style={styles.tutorialStep}>
                        <Text style={styles.tutorialStepNumber}>2</Text>
                        <Text style={styles.tutorialStepText}>Share the room code with others to let them join</Text>
                    </View>

                    <View style={styles.tutorialStep}>
                        <Text style={styles.tutorialStepNumber}>3</Text>
                        <Text style={styles.tutorialStepText}>Use the controls to manage your camera and microphone</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.tutorialButton}
                        onPress={() => setShowTutorial(false)}
                    >
                        <Text style={styles.tutorialButtonText}>Got it!</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    // Render VideoCall component when in active call
    if (isInCall) {
        return <VideoCall
            roomId={roomId}
            roomRefId={roomDocID}
            isBroadcaster={isBroadcaster}
            onHangUp={() => {
                setIsInCall(false)
                setRoomId('')
                setRoomDocID('')
            }}
        />;
    }

    return (
        <View style={styles.container}>
            <TutorialOverlay />
            <Text style={styles.title}>HoloStream</Text>
            <Text style={styles.subtitle}>"Join or start a video conference instantly — connect, collaborate, and communicate with ease."</Text>

            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.button} onPress={startNewCall}>
                    <Text style={styles.buttonText}>Create New Room</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Room Code"
                    value={roomId}
                    onChangeText={setRoomId}
                    autoCapitalize="none"
                    keyboardType='numeric'
                    returnKeyType='done'
                />
                <TouchableOpacity
                    disabled={isLoading}
                    style={[styles.button, { marginTop: 10 }]}
                    onPress={joinExistingCall}
                >
                    {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join Room</Text>}
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.instructionsLink}
                onPress={handleShowTutorial}
            >
                <Text style={styles.instructionsLinkText}>See Instructions</Text>
            </TouchableOpacity>
        </View>
    );
};

export default CallScreen; 