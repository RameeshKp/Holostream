import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
    roomIdActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roomIdText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007AFF',
        flex: 1,
    },
    roomIdButtons: {
        flexDirection: 'row',
        marginLeft: 10,
    },
    roomIdButton: {
        padding: 8,
        marginLeft: 5,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
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