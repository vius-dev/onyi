-- Grant execute permissions to anon role for public poll viewing
GRANT EXECUTE ON FUNCTION get_poll_with_viewer_status(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, UUID[], UUID) TO anon; -- Technically anon shouldn't vote efficiently without user_id, but function handles auth check
