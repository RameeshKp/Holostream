import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import VideoCall from '../../components/VideoCall';
import firestore from '@react-native-firebase/firestore';
import { TOAST_TYPE } from '../../utils/Toast';
import { showToast } from '../../utils/Toast';
import { styles } from './styles';


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
                showToast(TOAST_TYPE.ERROR, 'Room does not exist or is not active');
                return;
            }

            setRoomDocID(activeRoom.id);
            setIsBroadcaster(false);
            setIsInCall(true);
            // setRoomId(''); // Reset input after successful join
        } catch (error) {
            console.error('Error checking room:', error);
            showToast(TOAST_TYPE.ERROR, 'Failed to join room');
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
            <Text style={styles.title}>HoloStream</Text>
            <Text style={styles.subtitle}>"Join or start a video conference instantly — connect, collaborate, and communicate with ease."</Text>

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



export default CallScreen; 