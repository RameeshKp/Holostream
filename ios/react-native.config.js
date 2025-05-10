module.exports = {
    reactNativePath: './node_modules/react-native',
    codegenConfig: {
        // Prevent codegen by setting an empty config or invalid paths
        ios: {
            source: '',
            outputDir: '',
        },
    },
};
