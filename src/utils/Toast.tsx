import Toast from "react-native-toast-message";

export enum TOAST_TYPE {
    SUCCESS = 'success',
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info'
}

// Function to get the color based on toast type
const getToastColor = (type: string) => {
    switch (type) {
        case TOAST_TYPE.SUCCESS:
            return 'green';
        case TOAST_TYPE.ERROR:
            return 'red';
        case TOAST_TYPE.WARNING:
            return 'yellow';
        case TOAST_TYPE.INFO:
            return 'blue';
        default:
            return 'black'; // Default color if type is unknown
    }
};

export const showToast = (type: string, toastMessage: string) => {
    Toast.show({
        type: type,
        text1: type.toUpperCase(),
        text2: toastMessage,
        visibilityTime: 3000,
        text1Style: {
            color: getToastColor(type),
            fontWeight: 'bold',
        },
        text2Style: {
            color: '#000000',
            fontSize: 10,
            flexWrap: 'wrap',
            width: '100%',
        },

    });
};
