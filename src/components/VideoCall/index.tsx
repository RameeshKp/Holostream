import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    Text,
    FlatList,
    Share,
    ActivityIndicator,
} from 'react-native';
import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    RTCView,
    mediaDevices,
    MediaStreamTrack,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast, TOAST_TYPE } from '../../utils/Toast';
import { styles } from './styles';

interface VideoCallProps {
    roomId: string;
    roomRefId?: string;
    isBroadcaster: boolean;
    onHangUp: () => void;
}

/**
 * VideoCall Component
 * Handles WebRTC peer connections and video streaming between participants
 * 
 * Core Features:
 * - Real-time video/audio streaming using WebRTC
 * - Manual signaling using Firebase Firestore
 * - Camera/microphone controls
 * - Room management (create/join)
 * 
 * Signaling Process:
 * 1. Broadcaster creates room and generates offer
 * 2. Viewer joins room and receives offer
 * 3. Viewer creates answer and sends back
 * 4. ICE candidates are exchanged for NAT traversal
 * 5. Peer connection established for media streaming
 */
const VideoCall: React.FC<VideoCallProps> = ({ roomId, roomRefId, isBroadcaster, onHangUp }) => {
    // State for managing media streams and connection status
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStreams, setRemoteStreams] = useState<any[]>([]);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isHangUp, setIsHangUp] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [showRoomId, setShowRoomId] = useState(false);
    const [roomDocId, setRoomDocId] = useState<string | undefined>(roomRefId);
    const [streamsUpdateKey, setStreamsUpdateKey] = useState(0);

    // Refs for maintaining WebRTC connections and streams
    const remoteStreamsRef = useRef<any[]>([]);
    const roomStatusUnsubscribe = useRef<(() => void) | null>(null);
    const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
    const localStreamRef = useRef<any>(null);

    // WebRTC configuration for NAT traversal
    // Uses Google's STUN servers to help establish peer connections
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

    // Media control states
    const [isCameraEnabled, setIsCameraEnabled] = useState(true);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    const [participantStatus, setParticipantStatus] = useState<{ [key: string]: { camera: boolean, audio: boolean } }>({});

    /**
     * Updates participant's media status in Firestore
     * Used to sync camera/audio state across peers
     * This ensures all participants know the state of others' media
     */
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
        } catch (err) {
            console.error('Error updating participant status:', err);
        }
    };

    /**
     * Initial setup: Get local media stream and set up Firestore listeners
     * This is the entry point for establishing the video call
     */
    useEffect(() => {
        setupLocalStream();
        setupFirestoreListeners();
        remoteStreamsRef.current = remoteStreams;
        return () => {
            cleanup();
        };
    }, [roomId]);

    /**
     * Initializes local media stream with camera and microphone
     * Sets up the initial video/audio tracks for the local user
     */
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

    /**
     * Sets up Firestore listeners for real-time updates
     * Handles:
     * - Room status changes (active/inactive)
     * - Participant status updates (camera/audio state)
     * - New participants joining
     * - ICE candidates for peer connection
     */
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
                        showToast(TOAST_TYPE.ERROR, 'The host has ended the call.');
                        hangUp();
                    }
                } else {
                    showToast(TOAST_TYPE.ERROR, 'The room is no longer available.');
                    hangUp();
                }
            });
        }

        // Listen for participant status changes
        roomRef.collection('participant-status').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added' || change.type === 'modified') {
                    const status = change.doc.data();
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

        // Listen for new participants and handle WebRTC connection
        roomRef.collection('participants').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    handleNewParticipant(change.doc.id);
                } else if (change.type === 'removed') {
                    handleParticipantLeft(change.doc.id);
                }
            });
        });

        // Listen for ICE candidates from peers
        roomRef.collection('ice-candidates').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const candidate = change.doc.data();
                    handleNewICECandidate(candidate);
                }
            });
        });
    };

    /**
     * Handles new participant joining the room
     * Creates peer connection and initiates WebRTC offer
     * This is the start of the WebRTC signaling process
     */
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

    /**
     * Creates and configures a new WebRTC peer connection
     * Sets up event handlers for:
     * - ICE candidates (for NAT traversal)
     * - Connection state changes
     * - Incoming media tracks
     */
    const createPeerConnection = (participantId: string) => {
        const pc = new RTCPeerConnection(configuration);

        // Handle ICE candidates
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

        // Handle connection state changes
        (pc as any).oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                handleParticipantLeft(participantId);
            }
        };

        // Handle incoming media tracks
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

        // Add local tracks to peer connection
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track: any) => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        peerConnections.current[participantId] = pc;
        return pc;
    };

    /**
     * Handles new ICE candidate from peer
     * ICE candidates are used for NAT traversal to establish direct peer connections
     */
    const handleNewICECandidate = async (candidate: any) => {
        const pc = peerConnections.current[candidate.participantId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
        }
    };

    /**
     * Handles participant leaving the room
     * Cleans up peer connection and removes their stream
     * Ensures proper resource cleanup when a participant disconnects
     */
    const handleParticipantLeft = (participantId: string) => {
        // Close and remove the peer connection
        const pc = peerConnections.current[participantId];
        if (pc) {
            pc.close();
            delete peerConnections.current[participantId];
        }

        // Remove participant's stream and stop all tracks
        const updatedStreams = remoteStreamsRef.current.filter(stream => {
            const isParticipantStream = stream.id.includes(participantId);
            if (isParticipantStream) {
                stream.getTracks().forEach((track: any) => {
                    track.stop();
                });
            }
            return !isParticipantStream;
        });

        setRemoteStreams(updatedStreams);
        setStreamsUpdateKey(prev => prev + 1);
    };

    /**
     * Initiates a new call as the broadcaster
     * Creates room, peer connection, and WebRTC offer
     * This is the entry point for starting a new video call
     */
    const startCall = async () => {
        setIsConnecting(true);
        try {
            // Create room in Firestore
            const roomRef = await firestore().collection('rooms').add({
                status: 'active',
                createdAt: firestore.FieldValue.serverTimestamp(),
                roomId: roomId
            });
            setRoomDocId(roomRef.id);

            // Initialize broadcaster status
            await updateParticipantStatus(true, true);

            // Create peer connection and generate offer
            const pc = createPeerConnection('broadcaster');
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            // Save offer to Firestore
            await roomRef.collection('offers').doc('broadcaster').set({
                sdp: offer.sdp,
                type: offer.type,
                createdAt: firestore.FieldValue.serverTimestamp()
            });

            // Set up listeners for answers and ICE candidates
            setupAnswerListener(roomRef, pc);
            setupICECandidateListener(roomRef, pc);

            setShowRoomId(true);
            setIsConnected(true);
            showToast(TOAST_TYPE.SUCCESS, 'You are now in the call');
        } catch (err) {
            console.error('Error starting call:', err);
            showToast(TOAST_TYPE.ERROR, 'Something went wrong starting the call');
        } finally {
            setIsConnecting(false);
        }
    };

    /**
     * Joins an existing call as a viewer
     * Retrieves offer, creates answer, and establishes connection
     * This is the entry point for joining an existing video call
     */
    const joinCall = async () => {
        setIsConnecting(true);
        try {
            // Initialize viewer status
            await updateParticipantStatus(true, true);

            // Get room reference and broadcaster's offer
            const roomRef = firestore().collection('rooms').doc(roomDocId);
            const offerDoc = await roomRef.collection('offers').doc('broadcaster').get();

            if (!offerDoc.exists) {
                throw new Error('No offer found from broadcaster');
            }

            // Create peer connection and set remote description
            const offerData = offerDoc.data() as { sdp: string; type: string };
            const pc = createPeerConnection('viewer');
            await pc.setRemoteDescription(new RTCSessionDescription({
                sdp: offerData.sdp,
                type: offerData.type
            }));

            // Create and save answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await roomRef.collection('answers').doc('viewer').set({
                sdp: answer.sdp,
                type: answer.type,
                createdAt: firestore.FieldValue.serverTimestamp()
            });

            // Set up ICE candidate listener
            setupICECandidateListener(roomRef, pc);

            // Add existing ICE candidates
            await addExistingICECandidates(roomRef, pc);

            setIsConnected(true);
            showToast(TOAST_TYPE.SUCCESS, 'You have joined the call');
        } catch (err) {
            console.error('Error joining call:', err);
            showToast(TOAST_TYPE.ERROR, 'Failed to join call');
        } finally {
            setIsConnecting(false);
        }
    };

    /**
     * Ends the call and cleans up resources
     * Updates room status and removes participant data
     * Ensures proper cleanup of all WebRTC resources
     */
    const hangUp = async () => {
        try {
            setIsHangUp(true);

            // Clean up listeners and connections
            cleanupConnections();

            // Update room status if broadcaster
            if (isBroadcaster && roomDocId) {
                await updateRoomStatus();
            }

            setIsConnected(false);
            setIsHangUp(false);
            onHangUp();
        } catch (err) {
            console.error('Error during hang up:', err);
            showToast(TOAST_TYPE.ERROR, 'Failed to properly end the call');
        } finally {
            setIsHangUp(false);
        }
    };

    /**
     * Toggles camera between front and back
     * Updates video track in peer connections
     * Handles camera switching while maintaining the call
     */
    const toggleCamera = async () => {
        try {
            setIsCameraEnabled(true);
            if (localStreamRef.current) {
                // Stop current video track
                const currentTracks = localStreamRef.current.getVideoTracks();
                if (currentTracks.length > 0) {
                    currentTracks[0].stop();
                }

                // Get new stream with opposite camera
                const newStream = await mediaDevices.getUserMedia({
                    audio: isAudioEnabled,
                    video: {
                        width: { min: 640 },
                        height: { min: 480 },
                        frameRate: { min: 30 },
                        facingMode: isFrontCamera ? 'environment' : 'user'
                    },
                });

                // Update video track in all peer connections
                updateVideoTrackInConnections(newStream);

                setLocalStream(newStream);
                localStreamRef.current = newStream;
                setIsFrontCamera(!isFrontCamera);
            }
        } catch (err) {
            console.error('Error switching camera:', err);
            showToast(TOAST_TYPE.ERROR, 'Failed to switch camera');
        }
    };

    /**
     * Toggles video stream on/off
     * Updates participant status in Firestore
     * Handles video muting while maintaining the call
     */
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

    /**
     * Toggles audio stream on/off
     * Updates participant status in Firestore
     * Handles audio muting while maintaining the call
     */
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

    const handleCopyRoomId = async () => {
        try {
            await Clipboard.setString(roomId);
            showToast(TOAST_TYPE.SUCCESS, 'Room code copied');
        } catch (err) {
            console.error('Error copying room ID:', err);
            showToast(TOAST_TYPE.ERROR, 'Failed to copy room ID');
        }
    };

    const handleShareRoomId = async () => {
        try {
            await Share.share({
                message: `Join my video call on HoloStream! Room Code: ${roomId}`,
            });
        } catch (err) {
            console.error('Error sharing room ID:', err);
            showToast(TOAST_TYPE.ERROR, 'Failed to share room ID');
        }
    };

    /**
     * Sets up listener for WebRTC answers
     */
    const setupAnswerListener = (roomRef: any, pc: RTCPeerConnection) => {
        roomRef.collection('answers').onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach(async (change: any) => {
                if (change.type === 'added') {
                    const answer = change.doc.data();
                    await pc.setRemoteDescription(new RTCSessionDescription({
                        sdp: answer.sdp,
                        type: answer.type
                    }));
                }
            });
        });
    };

    /**
     * Sets up listener for ICE candidates
     */
    const setupICECandidateListener = (roomRef: any, pc: RTCPeerConnection) => {
        const participantId = isBroadcaster ? 'viewer' : 'broadcaster';
        roomRef.collection('ice-candidates')
            .where('participantId', '==', participantId)
            .onSnapshot((snapshot: any) => {
                snapshot.docChanges().forEach(async (change: any) => {
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
    };

    /**
     * Adds existing ICE candidates to peer connection
     */
    const addExistingICECandidates = async (roomRef: any, pc: RTCPeerConnection) => {
        const participantId = isBroadcaster ? 'viewer' : 'broadcaster';
        const existingCandidates = await roomRef.collection('ice-candidates')
            .where('participantId', '==', participantId)
            .get();

        for (const doc of existingCandidates.docs) {
            const candidate = doc.data();
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate.candidate));
            } catch (err) {
                console.error('Error adding existing ICE candidate:', err);
            }
        }
    };

    /**
     * Updates video track in all peer connections
     */
    const updateVideoTrackInConnections = (newStream: any) => {
        Object.values(peerConnections.current).forEach((pc) => {
            const senders = pc.getSenders();
            const videoSender = senders.find(sender => sender.track?.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(newStream.getVideoTracks()[0]);
            }
        });
    };

    /**
     * Cleans up all connections and resources
     */
    const cleanupConnections = async () => {
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

        // Remove participant status
        if (roomDocId) {
            const statusRef = firestore()
                .collection('rooms')
                .doc(roomDocId)
                .collection('participant-status')
                .doc(isBroadcaster ? 'broadcaster' : 'viewer');
            await statusRef.delete();
        }
    };

    /**
     * Updates room status to inactive
     */
    const updateRoomStatus = async () => {
        const roomRef = firestore().collection('rooms').doc(roomDocId);
        const roomDoc: any = await roomRef.get();
        if (roomDoc._exists) {
            await roomRef.update({
                status: 'inactive',
                endedAt: firestore.FieldValue.serverTimestamp()
            });
        }
    };

    /**
     * Cleanup function for component unmount
     */
    const cleanup = async () => {
        try {
            await cleanupConnections();
            if (isBroadcaster && roomDocId) {
                await updateRoomStatus();
            }
            onHangUp();
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    };

    return (
        <View style={styles.container}>
            {(isBroadcaster && showRoomId) || !isBroadcaster ? (
                <View style={styles.roomIdContainer}>
                    <Text style={styles.roomIdLabel}>Your Room Code</Text>
                    <View style={styles.roomIdActions}>
                        <Text style={styles.roomIdText}>{roomId}</Text>
                        <View style={styles.roomIdButtons}>
                            <TouchableOpacity
                                style={styles.roomIdButton}
                                onPress={handleCopyRoomId}
                            >
                                <Icon name="content-copy" size={20} color="#007AFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.roomIdButton}
                                onPress={handleShareRoomId}
                            >
                                <Icon name="share-variant" size={20} color="#007AFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
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

                {isConnected ?
                    <TouchableOpacity
                        style={[styles.button, styles.hangUpButton]}
                        onPress={hangUp}
                        disabled={isHangUp}
                    >
                        {isHangUp ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Hang Up</Text>}
                    </TouchableOpacity> :
                    <TouchableOpacity
                        style={[styles.button, styles.hangUpButton]}
                        onPress={onHangUp}
                    >
                        <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>}
            </View>
        </View>
    );
};

export default VideoCall; 