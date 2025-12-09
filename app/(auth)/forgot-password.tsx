import { StyleSheet, Text, View } from 'react-native';

export default function ForgotPasswordScreen() {
    return (
        <View style={styles.container}>
            <Text>Forgot Password Screen (Steps in BACKEND_SETUP.md)</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
