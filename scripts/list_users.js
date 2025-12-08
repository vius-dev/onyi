require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listUsers() {
    const { data, error } = await supabase.from('users').select('*').limit(5);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Users:", data);
    }
}

listUsers();
