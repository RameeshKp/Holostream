import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
} from 'react-native';
// import VideoCall from '../components/VideoCall';

const CallScreen: React.FC = () => {
    const [roomId, setRoomId] = useState('');
    const [isInCall, setIsInCall] = useState(false);
    const [isBroadcaster, setIsBroadcaster] = useState(false);

    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 15);
    };

    const startNewCall = () => {
        const newRoomId = generateRoomId();
        setRoomId(newRoomId);
        setIsBroadcaster(true);
        setIsInCall(true);
    };

    const joinExistingCall = () => {
        if (!roomId.trim()) {
            Alert.alert('Error', 'Please enter a room ID');
            return;
        }
        setIsBroadcaster(false);
        setIsInCall(true);
    };

    if (isInCall) {
        // return <VideoCall roomId={roomId} isBroadcaster={isBroadcaster} />;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>HoloStream Video Call</Text>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Room ID"
                    value={roomId}
                    onChangeText={setRoomId}
                    autoCapitalize="none"
                />
            </View>

            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.button} onPress={startNewCall}>
                    <Text style={styles.buttonText}>Start New Call</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.button} onPress={joinExistingCall}>
                    <Text style={styles.buttonText}>Join Call</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
        color: '#333',
    },
    inputContainer: {
        marginBottom: 20,
    },
    input: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        fontSize: 16,
    },
    buttonContainer: {
        gap: 10,
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CallScreen; 