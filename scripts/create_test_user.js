require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTestUser() {
    const email = `testuser_${Date.now()}@gmail.com`;
    const password = 'Password123!';

    console.log(`Creating user: ${email}`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error("Error creating user:", error);
    } else {
        const user = data.user;
        console.log("User created successfully!");
        console.log("ID:", user.id);
        console.log("Email:", user.email);

        // Give the trigger a moment to run
        await new Promise(r => setTimeout(r, 2000));

        // Setup profile
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ username: `user_${user.id.substr(0, 8)}`, display_name: 'Test User' }) // update because trigger might have created it
            .eq('id', user.id);

        if (profileError) {
            // If update failed, maybe insert (if trigger didn't work?)
            console.log("Update profile failed, trying insert...", profileError);
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({ id: user.id, username: `user_${user.id.substr(0, 8)}`, display_name: 'Test User' });
            if (insertError) console.error("Insert profile error:", insertError);
            else console.log("Profile inserted.");
        } else {
            console.log("Profile updated.");
        }
    }
}

createTestUser();
