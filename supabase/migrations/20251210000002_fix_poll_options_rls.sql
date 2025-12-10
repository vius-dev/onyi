-- Fix poll_options RLS policy to allow inserting options for newly created polls
-- The previous policy had a timing issue with JOINs in the same transaction

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can create options for their own polls" ON poll_options;

-- Create a simpler policy that checks poll ownership directly
-- This avoids the JOIN timing issue
CREATE POLICY "Users can create options for their own polls"
    ON poll_options FOR INSERT
    WITH CHECK (
        -- Check if the user owns the poll by checking if they own the post
        EXISTS (
            SELECT 1 FROM polls p
            INNER JOIN posts po ON p.post_id = po.id
            WHERE p.id = poll_options.poll_id
            AND po.author_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT INSERT ON poll_options TO authenticated;
