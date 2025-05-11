import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Text,
    Alert,
    FlatList,
} from 'react-native';
import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    RTCView,
    MediaStream,
    mediaDevices,
    MediaStreamTrack,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface VideoCallProps {
    roomId: string;
    roomRefId?: string;
    isBroadcaster: boolean;
    onHangUp: () => void;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, roomRefId, isBroadcaster, onHangUp }) => {
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStreams, setRemoteStreams] = useState<any[]>([]);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [showRoomId, setShowRoomId] = useState(false);
    const [roomDocId, setRoomDocId] = useState<string | undefined>(roomRefId);
    const [streamsUpdateKey, setStreamsUpdateKey] = useState(0);
    const remoteStreamsRef = useRef<any[]>([]);
    const roomStatusUnsubscribe = useRef<(() => void) | null>(null);

    const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
    const localStreamRef = useRef<any>(null);

    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
    };

    const [isCameraEnabled, setIsCameraEnabled] = useState(true);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    const [participantStatus, setParticipantStatus] = useState<{ [key: string]: { camera: boolean, audio: boolean } }>({});

    const updateParticipantStatus = async (camera: boolean, audio: boolean) => {
        if (!roomDocId) return;

        try {
            const statusRef = firestore()
                .collection('rooms')
                .doc(roomDocId)
                .collection('participant-status')
                .doc(isBroadcaster ? 'broadcaster' : 'viewer');

            await statusRef.set({
                camera,
                audio,
                updatedAt: firestore.FieldValue.serverTimestamp()
            });
            console.log("🚀 ~ updateParticipantStatus ~ statusRef:", statusRef)
        } catch (err) {
            console.error('Error updating participant status:', err);
        }
    };

    useEffect(() => {
        setupLocalStream();
        setupFirestoreListeners();
        remoteStreamsRef.current = remoteStreams;
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
            console.error('Error accessing media devices:', err);
        }
    };

    const setupFirestoreListeners = () => {
        const roomRef: any = firestore().collection('rooms').doc(roomDocId);

        // Listen for room status changes (for viewers)
        if (!isBroadcaster) {
            if (roomStatusUnsubscribe.current) {
                roomStatusUnsubscribe.current();
            }

            roomStatusUnsubscribe.current = roomRef.onSnapshot((doc: any) => {
                const exists: any = doc._exists;
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

        // Listen for participant status changes
        roomRef.collection('participant-status').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added' || change.type === 'modified') {
                    const status = change.doc.data();
                    console.log("🚀 ~ snapshot.docChanges ~ status:", status)
                    setParticipantStatus(prev => ({
                        ...prev,
                        [change.doc.id]: {
                            camera: status.camera,
                            audio: status.audio
                        }
                    }));
                }
            });
        });

        // Listen for new participants
        roomRef.collection('participants').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    handleNewParticipant(change.doc.id);
                } else if (change.type === 'removed') {
                    handleParticipantLeft(change.doc.id);
                }
            });
        });

        // Listen for ICE candidates
        roomRef.collection('ice-candidates').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
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
                const roomRef = firestore().collection('rooms').doc(roomDocId);
                roomRef.collection('ice-candidates').add({
                    candidate: event.candidate,
                    participantId,
                    createdAt: firestore.FieldValue.serverTimestamp()
                });
            }
        };

        (pc as any).oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                handleParticipantLeft(participantId);
            }
        };

        (pc as any).ontrack = (event: { streams: any[] }) => {
            if (event.streams && event.streams[0]) {
                const newStream = event.streams[0];
                setRemoteStreams(prev => {
                    const exists = prev.some(stream => stream.id === newStream.id);
                    if (!exists) {
                        return [...prev, newStream];
                    }
                    return prev;
                });
            }
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

    const handleParticipantLeft = (participantId: string) => {

        // Close and remove the peer connection
        const pc = peerConnections.current[participantId];
        if (pc) {
            pc.close();
            delete peerConnections.current[participantId];
        }

        // Create a new array without the leaving participant's stream
        const updatedStreams = remoteStreamsRef.current.filter(stream => {
            const isParticipantStream = stream.id.includes(participantId);
            if (isParticipantStream) {
                // Stop all tracks in the stream
                stream.getTracks().forEach((track: any) => {
                    track.stop();
                });
            }
            return !isParticipantStream;
        });

        // Update the streams state
        setRemoteStreams(updatedStreams);
        setStreamsUpdateKey(prev => prev + 1);
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
            setRoomDocId(roomRef.id);

            // Initialize broadcaster status
            await updateParticipantStatus(true, true);

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
            setIsConnected(true);
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
            // Initialize viewer status
            await updateParticipantStatus(true, true);

            // 1. Get the room reference
            const roomRef = firestore().collection('rooms').doc(roomDocId);
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
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
                            } catch (err) {
                                console.error('Error adding ICE candidate:', err);
                            }
                        }
                    });
                });

            // 8. Listen for any existing ICE candidates from broadcaster
            const existingCandidates = await roomRef.collection('ice-candidates')
                .where('participantId', '==', 'broadcaster')
                .get();

            for (const doc of existingCandidates.docs) {
                const candidate = doc.data();
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
                } catch (err) {
                    console.error('Error adding existing ICE candidate:', err);
                }
            }
            setIsConnected(true);

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
            // Unsubscribe from room status listener
            if (roomStatusUnsubscribe.current) {
                roomStatusUnsubscribe.current();
                roomStatusUnsubscribe.current = null;
            }

            // Close all peer connections
            Object.values(peerConnections.current).forEach((pc) => {
                pc.close();
            });
            peerConnections.current = {};
            setRemoteStreams([]);
            setStreamsUpdateKey(prev => prev + 1);

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
            setIsConnected(false);
            onHangUp();
        } catch (err) {
            console.error('Error during hang up:', err);
            Alert.alert('Error', 'Failed to properly end the call');
        }
    };

    const cleanup = async () => {
        try {
            // Unsubscribe from room status listener
            if (roomStatusUnsubscribe.current) {
                roomStatusUnsubscribe.current();
                roomStatusUnsubscribe.current = null;
            }

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

            // Clear remote streams
            setRemoteStreams([]);
            setStreamsUpdateKey(prev => prev + 1);

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

            // Remove participant status
            if (roomDocId) {
                const statusRef = firestore()
                    .collection('rooms')
                    .doc(roomDocId)
                    .collection('participant-status')
                    .doc(isBroadcaster ? 'broadcaster' : 'viewer');
                await statusRef.delete();
            }

            onHangUp();
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    };

    const toggleCamera = async () => {
        try {
            setIsCameraEnabled(true);
            if (localStreamRef.current) {
                const currentTracks = localStreamRef.current.getVideoTracks();
                if (currentTracks.length > 0) {
                    currentTracks[0].stop();
                }

                const newStream = await mediaDevices.getUserMedia({
                    audio: isAudioEnabled,
                    video: {
                        width: { min: 640 },
                        height: { min: 480 },
                        frameRate: { min: 30 },
                        facingMode: isFrontCamera ? 'environment' : 'user'
                    },
                });

                // Update all peer connections with the new video track
                Object.values(peerConnections.current).forEach((pc) => {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(sender => sender.track?.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(newStream.getVideoTracks()[0]);
                    }
                });

                setLocalStream(newStream);
                localStreamRef.current = newStream;
                setIsFrontCamera(!isFrontCamera);
            }
        } catch (err) {
            console.error('Error switching camera:', err);
            Alert.alert('Error', 'Failed to switch camera');
        }
    };

    const toggleVideo = async () => {
        if (localStreamRef.current) {
            const videoTracks = localStreamRef.current.getVideoTracks();
            const newCameraState = !isCameraEnabled;
            videoTracks.forEach((track: MediaStreamTrack) => {
                track.enabled = newCameraState;
            });
            setIsCameraEnabled(newCameraState);
            await updateParticipantStatus(newCameraState, isAudioEnabled);
        }
    };

    const toggleAudio = async () => {
        if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            const newAudioState = !isAudioEnabled;
            audioTracks.forEach((track: MediaStreamTrack) => {
                track.enabled = newAudioState;
            });
            setIsAudioEnabled(newAudioState);
            await updateParticipantStatus(isCameraEnabled, newAudioState);
        }
    };

    const renderStreamControls = (isLocal: boolean, participantId: string = '') => {
        const status = isLocal ?
            { camera: isCameraEnabled, audio: isAudioEnabled } :
            participantStatus[participantId] || { camera: true, audio: true };

        return (
            <View style={styles.streamControls}>
                {isLocal ? (
                    <>
                        <TouchableOpacity
                            style={[styles.controlButton, !status.camera && styles.controlButtonDisabled]}
                            onPress={toggleVideo}
                        >
                            <Icon
                                name={status.camera ? "video" : "video-off"}
                                size={24}
                                color="#fff"
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.controlButton, !status.audio && styles.controlButtonDisabled]}
                            onPress={toggleAudio}
                        >
                            <Icon
                                name={status.audio ? "microphone" : "microphone-off"}
                                size={24}
                                color="#fff"
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.controlButton}
                            onPress={toggleCamera}
                        >
                            <Icon
                                name="camera-flip"
                                size={24}
                                color="#fff"
                            />
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <View style={[styles.controlButton, !status.camera && styles.controlButtonDisabled]}>
                            <Icon
                                name={status.camera ? "video" : "video-off"}
                                size={24}
                                color="#fff"
                            />
                        </View>
                        <View style={[styles.controlButton, !status.audio && styles.controlButtonDisabled]}>
                            <Icon
                                name={status.audio ? "microphone" : "microphone-off"}
                                size={24}
                                color="#fff"
                            />
                        </View>
                    </>
                )}
            </View>
        );
    };

    const renderRemoteStream = ({ item: stream, index }: { item: any; index: number }) => {
        const participantId = isBroadcaster ? 'viewer' : 'broadcaster';
        const status = participantStatus[participantId] || { camera: true, audio: true };

        return (
            <View style={styles.remoteStream}>
                <RTCView
                    streamURL={stream.toURL()}
                    style={styles.videoStream}
                    objectFit="cover"
                    mirror={true}
                />
                {/* {status.camera ? (
                    <RTCView
                        streamURL={stream.toURL()}
                        style={styles.videoStream}
                        objectFit="cover"
                        mirror={true}
                    />
                ) : (
                    <View style={[styles.videoStream, styles.disabledVideo]}>
                        <Text style={styles.disabledVideoText}>Camera Off</Text>
                    </View>
                )} */}
                <Text style={styles.streamLabel}>Remote Stream {index + 1}</Text>
                {/* {renderStreamControls(false, participantId)} */}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {(isBroadcaster && showRoomId) || !isBroadcaster ? (
                <View style={styles.roomIdContainer}>
                    <Text style={styles.roomIdLabel}>Share this Room ID:</Text>
                    <Text style={styles.roomIdText}>{roomId}</Text>
                </View>
            ) : null}

            <ScrollView style={styles.streamsContainer}>
                {localStream && (
                    <View style={styles.localStream}>
                        {isCameraEnabled ? (
                            <RTCView
                                streamURL={localStream.toURL()}
                                style={styles.videoStream}
                                objectFit="cover"
                                mirror={true}
                            />
                        ) : (
                            <View style={[styles.videoStream, styles.disabledVideo]}>
                                <Text style={styles.disabledVideoText}>Camera Off</Text>
                            </View>
                        )}
                        <Text style={styles.streamLabel}>Local Stream</Text>
                        {renderStreamControls(true)}
                    </View>
                )}

                <FlatList
                    data={remoteStreams}
                    renderItem={renderRemoteStream}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    style={styles.remoteStreamsList}
                    extraData={streamsUpdateKey}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                    initialNumToRender={5}
                />
            </ScrollView>

            <View style={styles.controls}>
                {isBroadcaster ? (
                    !isConnected && <TouchableOpacity
                        style={styles.button}
                        onPress={startCall}
                        disabled={isConnecting}
                    >
                        <Text style={styles.buttonText}>
                            {isConnecting ? 'Starting...' : 'Start Call'}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    !isConnected && <TouchableOpacity
                        style={styles.button}
                        onPress={joinCall}
                        disabled={isConnecting}
                    >
                        <Text style={styles.buttonText}>
                            {isConnecting ? 'Joining...' : 'Join Call'}
                        </Text>
                    </TouchableOpacity>
                )}

                {isConnected ? <TouchableOpacity
                    style={[styles.button, styles.hangUpButton]}
                    onPress={hangUp}
                >
                    <Text style={styles.buttonText}>Hang Up</Text>
                </TouchableOpacity> : <TouchableOpacity
                    style={[styles.button, styles.hangUpButton]}
                    onPress={onHangUp}
                >
                    <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>}
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
    remoteStreamsList: {
        flex: 1,
    },
    streamControls: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
        padding: 5,
    },
    controlButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 5,
    },
    controlButtonDisabled: {
        backgroundColor: 'rgba(255,0,0,0.3)',
    },
    disabledVideo: {
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    disabledVideoText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default VideoCall; 