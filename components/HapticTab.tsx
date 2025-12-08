import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";

export function HapticTab({ children, onPress, ref, ...rest }: BottomTabBarButtonProps) {
    return (
        <Pressable
            onPress={(e) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (onPress) {
                    onPress(e);
                }
            }}
            {...rest}
        >
            {children}
        </Pressable>
    );
}
