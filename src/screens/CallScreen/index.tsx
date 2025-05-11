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

const TUTORIAL_KEY = '@holostream_tutorial_shown';

const CallScreen: React.FC = () => {
    const [roomId, setRoomId] = useState('');
    const [roomDocID, setRoomDocID] = useState('');
    const [isInCall, setIsInCall] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isBroadcaster, setIsBroadcaster] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);

    useEffect(() => {
        checkTutorialStatus();
    }, []);

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

    const handleShowTutorial = () => {
        setShowTutorial(true);
    };

    const generateRoomId = () => {
        return Math.floor(1000 + Math.random() * 9000).toString();
    };

    const startNewCall = () => {
        const newRoomId = generateRoomId();
        setRoomId(newRoomId);
        setIsBroadcaster(true);
        setIsInCall(true);
    };

    const joinExistingCall = async () => {
        setIsLoading(true);
        if (!roomId.trim()) {
            setIsLoading(false);
            showToast(TOAST_TYPE.ERROR, 'Please enter a room ID');
            return;
        }

        try {
            const roomRef: any = firestore().collection('rooms');
            const roomDocs: any = (await roomRef.get())._docs;
            // Find room with matching roomId and active status
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