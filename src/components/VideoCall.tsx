import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Text,
    Alert,
} from 'react-native';
import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    mediaDevices,
    RTCView,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';

interface VideoCallProps {
    roomId: string;
    isBroadcaster: boolean;
    onHangUp: () => void;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, isBroadcaster, onHangUp }) => {
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStreams, setRemoteStreams] = useState<any[]>([]);
    const [isConnecting, setIsConnecting] = useState(false);
    const [showRoomId, setShowRoomId] = useState(false);
    const [roomDocId, setRoomDocId] = useState<string>('');

    const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
    const localStreamRef = useRef<any>(null);

    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
    };

    useEffect(() => {
        setupLocalStream();
        setupFirestoreListeners();
        return () => {
            cleanup();
        };
    }, [roomId]);

    const setupLocalStream = async () => {
        try {
            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: { min: 640 },
                    height: { min: 480 },
                    frameRate: { min: 30 },
                    facingMode: 'user'
                },
            });
            setLocalStream(stream);
            localStreamRef.current = stream;
        } catch (err) {
            console.log("🚀 ~ setupLocalStream ~ err:", err)
            console.error('Error accessing media devices:', err);
        }
    };

    const setupFirestoreListeners = () => {
        const roomRef = firestore().collection('rooms').doc(roomId);
        // Listen for room status changes (for viewers)
        if (!isBroadcaster) {
            roomRef.onSnapshot((doc) => {
                const exists: any = doc.exists;
                if (exists === true) {
                    const roomData = doc.data();
                    if (roomData?.status === 'inactive') {
                        Alert.alert('Call Ended', 'The broadcaster has ended the call');
                        hangUp();
                    }
                } else {
                    Alert.alert('Call Ended', 'The room no longer exists');
                    hangUp();
                }
            });
        }

        // Listen for new participants
        roomRef.collection('participants').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    handleNewParticipant(change.doc.id);
                }
            });
        });

        // Listen for ICE candidates
        roomRef.collection('ice-candidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = change.doc.data();
                    handleNewICECandidate(candidate);
                }
            });
        });
    };

    const handleNewParticipant = async (participantId: string) => {
        if (isBroadcaster) {
            const pc = createPeerConnection(participantId);
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            await firestore()
                .collection('rooms')
                .doc(roomId)
                .collection('offers')
                .doc(participantId)
                .set({
                    sdp: offer.sdp,
                    type: offer.type,
                });
        }
    };

    const createPeerConnection = (participantId: string) => {
        const pc = new RTCPeerConnection(configuration);

        (pc as any).onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
            if (event.candidate) {
                const roomRef = firestore().collection('rooms').doc(roomId);
                roomRef.collection('ice-candidates').add({
                    candidate: event.candidate,
                    participantId,
                    createdAt: firestore.FieldValue.serverTimestamp()
                });
            }
        };

        (pc as any).oniceconnectionstatechange = () => {

        };

        (pc as any).ontrack = (event: { streams: any[] }) => {
            setRemoteStreams((prev) => [...prev, event.streams[0]]);
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track: any) => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        peerConnections.current[participantId] = pc;
        return pc;
    };

    const handleNewICECandidate = async (candidate: any) => {
        const pc = peerConnections.current[candidate.participantId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
        }
    };

    const startCall = async () => {
        setIsConnecting(true);
        try {
            // 1. Create room in Firestore
            const roomRef = await firestore().collection('rooms').add({
                status: 'active',
                createdAt: firestore.FieldValue.serverTimestamp(),
                roomId: roomId
            });
            // Store the room document ID
            setRoomDocId(roomRef.id);

            // 2. Create peer connection
            const pc = createPeerConnection('broadcaster');

            // 3. Create and set local description (offer)
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            // 4. Save offer to Firestore
            await roomRef.collection('offers').doc('broadcaster').set({
                sdp: offer.sdp,
                type: offer.type,
                createdAt: firestore.FieldValue.serverTimestamp()
            });

            // 5. Listen for answers
            roomRef.collection('answers').onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const answer = change.doc.data();
                        await pc.setRemoteDescription(new RTCSessionDescription({
                            sdp: answer.sdp,
                            type: answer.type
                        }));
                    }
                });
            });

            // 6. Listen for ICE candidates from viewers
            roomRef.collection('ice-candidates')
                .where('participantId', '==', 'viewer')
                .onSnapshot((snapshot) => {
                    snapshot.docChanges().forEach(async (change) => {
                        if (change.type === 'added') {
                            const candidate = change.doc.data();
                            await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
                        }
                    });
                });

            setShowRoomId(true);
            Alert.alert('Success', 'Call started successfully');
        } catch (err) {
            console.error('Error starting call:', err);
            Alert.alert('Error', 'Failed to start call');
        } finally {
            setIsConnecting(false);
        }
    };

    const joinCall = async () => {
        setIsConnecting(true);
        try {
            // 1. Get the room reference
            const roomRef = firestore().collection('rooms').doc(roomId);

            // 2. Get the broadcaster's offer
            const offerDoc = await roomRef.collection('offers').doc('broadcaster').get();

            if (!offerDoc.exists) {
                throw new Error('No offer found from broadcaster');
            }

            const offerData = offerDoc.data() as { sdp: string; type: string };

            // 3. Create peer connection
            const pc = createPeerConnection('viewer');

            // 4. Set remote description (broadcaster's offer)
            await pc.setRemoteDescription(new RTCSessionDescription({
                sdp: offerData.sdp,
                type: offerData.type
            }));

            // 5. Create and set local description (answer)
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // 6. Save answer to Firestore
            await roomRef.collection('answers').doc('viewer').set({
                sdp: answer.sdp,
                type: answer.type,
                createdAt: firestore.FieldValue.serverTimestamp()
            });

            // 7. Listen for ICE candidates from broadcaster
            roomRef.collection('ice-candidates')
                .where('participantId', '==', 'broadcaster')
                .onSnapshot((snapshot) => {
                    snapshot.docChanges().forEach(async (change) => {
                        if (change.type === 'added') {
                            const candidate = change.doc.data();
                            await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
                        }
                    });
                });

            // 8. Listen for any existing ICE candidates from broadcaster
            const existingCandidates = await roomRef.collection('ice-candidates')
                .where('participantId', '==', 'broadcaster')
                .get();

            for (const doc of existingCandidates.docs) {
                const candidate = doc.data();
                await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
            }

            Alert.alert('Success', 'Joined call successfully');
        } catch (err) {
            console.error('Error joining call:', err);
            Alert.alert('Error', 'Failed to join call');
        } finally {
            setIsConnecting(false);
        }
    };

    const hangUp = async () => {
        try {
            // Close all peer connections
            Object.values(peerConnections.current).forEach((pc) => {
                pc.close();
            });
            peerConnections.current = {};
            setRemoteStreams([]);

            // Stop all local tracks
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track: any) => {
                    track.stop();
                });
            }

            // If broadcaster, update room status to inactive
            if (isBroadcaster && roomDocId) {
                const roomRef = firestore().collection('rooms').doc(roomDocId);
                const roomDoc: any = await roomRef.get();
                if (roomDoc._exists) {
                    await roomRef.update({
                        status: 'inactive',
                        endedAt: firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            onHangUp();
        } catch (err) {
            console.error('Error during hang up:', err);
            Alert.alert('Error', 'Failed to properly end the call');
        }
    };

    const cleanup = async () => {
        try {
            // Close all peer connections
            Object.values(peerConnections.current).forEach((pc) => {
                pc.close();
            });
            peerConnections.current = {};

            // Stop all local tracks
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track: any) => {
                    track.stop();
                });
            }

            // If broadcaster, update room status to inactive
            if (isBroadcaster) {
                const roomRef = firestore().collection('rooms').doc(roomId);
                const roomDoc: any = await roomRef.get();
                if (roomDoc._exists) {
                    await roomRef.update({
                        status: 'inactive',
                        endedAt: firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            onHangUp();
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    };

    return (
        <View style={styles.container}>
            {isBroadcaster && showRoomId && (
                <View style={styles.roomIdContainer}>
                    <Text style={styles.roomIdLabel}>Share this Room ID:</Text>
                    <Text style={styles.roomIdText}>{roomId}</Text>
                </View>
            )}
            <ScrollView style={styles.streamsContainer}>
                {localStream && (
                    <View style={styles.localStream}>
                        <RTCView
                            streamURL={localStream.toURL()}
                            style={styles.videoStream}
                            objectFit="cover"
                            mirror={true}
                        />
                        <Text style={styles.streamLabel}>Local Stream</Text>
                    </View>
                )}

                {remoteStreams.map((stream, index) => (
                    <View key={index} style={styles.remoteStream}>
                        <RTCView
                            streamURL={stream.toURL()}
                            style={styles.videoStream}
                            objectFit="cover"
                            mirror={true}
                        />
                        <Text style={styles.streamLabel}>Remote Stream {index + 1}</Text>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.controls}>
                {isBroadcaster ? (
                    <TouchableOpacity
                        style={styles.button}
                        onPress={startCall}
                        disabled={isConnecting}
                    >
                        <Text style={styles.buttonText}>
                            {isConnecting ? 'Starting...' : 'Start Call'}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.button}
                        onPress={joinCall}
                        disabled={isConnecting}
                    >
                        <Text style={styles.buttonText}>
                            {isConnecting ? 'Joining...' : 'Join Call'}
                        </Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[styles.button, styles.hangUpButton]}
                    onPress={hangUp}
                >
                    <Text style={styles.buttonText}>Hang Up</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    streamsContainer: {
        flex: 1,
        padding: 10,
    },
    localStream: {
        marginBottom: 10,
    },
    remoteStream: {
        marginBottom: 10,
    },
    videoStream: {
        width: '100%',
        height: 200,
        backgroundColor: '#000',
        borderRadius: 10,
    },
    streamLabel: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 5,
        borderRadius: 5,
    },
    controls: {
        padding: 20,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#ddd',
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        alignItems: 'center',
    },
    hangUpButton: {
        backgroundColor: '#FF3B30',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    roomIdContainer: {
        backgroundColor: '#fff',
        padding: 15,
        margin: 10,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    roomIdLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 5,
    },
    roomIdText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007AFF',
    },
});

export default VideoCall; 