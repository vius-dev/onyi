-- Fix ambiguous column reference in cast_poll_vote function
-- The variable name 'option_id' conflicts with the column name

DROP FUNCTION IF EXISTS cast_poll_vote(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION cast_poll_vote(
    poll_id_input UUID,
    option_ids_input UUID[],
    voter_id UUID DEFAULT auth.uid()
)
RETURNS JSON AS $$
DECLARE
    allows_multiple BOOLEAN;
    current_option_id UUID;  -- Renamed from option_id to avoid ambiguity
BEGIN
    -- Check if poll allows multiple choices
    SELECT allows_multiple_choices INTO allows_multiple
    FROM polls
    WHERE id = poll_id_input;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Poll not found';
    END IF;
    
    -- For single-choice polls, remove any existing votes first
    IF NOT allows_multiple THEN
        DELETE FROM poll_votes
        WHERE poll_id = poll_id_input AND user_id = voter_id;
    END IF;
    
    -- Insert new votes
    FOREACH current_option_id IN ARRAY option_ids_input
    LOOP
        INSERT INTO poll_votes (poll_id, option_id, user_id)
        VALUES (poll_id_input, current_option_id, voter_id)
        ON CONFLICT (user_id, option_id) DO NOTHING;
    END LOOP;
    
    -- Return updated poll status
    RETURN get_poll_with_viewer_status(poll_id_input, voter_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, UUID[], UUID) TO anon;
