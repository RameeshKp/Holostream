import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
} from 'react-native';
import VideoCall from '../components/VideoCall';
import firestore from '@react-native-firebase/firestore';

interface VideoCallProps {
    roomId: string;
    isBroadcaster: boolean;
    onHangUp: () => void;
}

const CallScreen: React.FC = () => {
    const [roomId, setRoomId] = useState('');
    const [roomDocID, setRoomDocID] = useState('');
    const [isInCall, setIsInCall] = useState(false);
    const [isBroadcaster, setIsBroadcaster] = useState(false);

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
        if (!roomId.trim()) {
            Alert.alert('Error', 'Please enter a room ID');
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
                Alert.alert('Error', 'Room does not exist or is not active');
                return;
            }

            setRoomDocID(activeRoom.id);
            setIsBroadcaster(false);
            setIsInCall(true);
            // setRoomId(''); // Reset input after successful join
        } catch (error) {
            console.error('Error checking room:', error);
            Alert.alert('Error', 'Failed to join room');
        }
    };

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
            <Text style={styles.title}>HoloStream Video Call</Text>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Room ID"
                    value={roomId}
                    onChangeText={setRoomId}
                    autoCapitalize="none"
                    keyboardType='numeric'
                    returnKeyType='next'
                    onSubmitEditing={joinExistingCall}
                />
            </View>

            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.button} onPress={startNewCall}>
                    <Text style={styles.buttonText}>Create New Room</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.button} onPress={joinExistingCall}>
                    <Text style={styles.buttonText}>Join Room</Text>
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