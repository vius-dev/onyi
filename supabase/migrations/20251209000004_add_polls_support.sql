-- =====================================================
-- POLLS MIGRATION WITH TWITTER-LIKE RLS SECURITY
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- POLLS TABLE
-- =====================================================
DROP TABLE IF EXISTS polls CASCADE;
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    question TEXT NOT NULL CHECK (char_length(question) <= 500),
    allows_multiple_choices BOOLEAN NOT NULL DEFAULT false,
    total_votes INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_expiration CHECK (expires_at > created_at),
    CONSTRAINT valid_total_votes CHECK (total_votes >= 0)
);

-- Index for faster lookups
CREATE INDEX idx_polls_post_id ON polls(post_id);
CREATE INDEX idx_polls_expires_at ON polls(expires_at);

-- =====================================================
-- POLL OPTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 200),
    votes INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_votes CHECK (votes >= 0),
    CONSTRAINT valid_position CHECK (position >= 0),
    CONSTRAINT unique_position_per_poll UNIQUE (poll_id, position)
);

-- Indexes for faster lookups
CREATE INDEX idx_poll_options_poll_id ON poll_options(poll_id);

-- =====================================================
-- POLL VOTES TABLE (tracks who voted for what)
-- =====================================================
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- User can only vote once per option in single-choice polls
    -- For multiple-choice, user can vote for multiple options
    CONSTRAINT unique_user_option_vote UNIQUE (user_id, option_id)
);

-- Indexes for faster lookups
CREATE INDEX idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_user_id ON poll_votes(user_id);
CREATE INDEX idx_poll_votes_option_id ON poll_votes(option_id);

-- =====================================================
-- POLL MEDIA TABLE (optional images/links for polls)
-- =====================================================
CREATE TABLE IF NOT EXISTS poll_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('image', 'link')),
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Only one media item per poll
    CONSTRAINT unique_poll_media UNIQUE (poll_id)
);

-- Index for faster lookups
CREATE INDEX idx_poll_media_poll_id ON poll_media(poll_id);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_polls_updated_at
    BEFORE UPDATE ON polls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VOTE COUNT TRIGGERS (auto-update vote counts)
-- =====================================================

-- Increment vote counts when a vote is added
CREATE OR REPLACE FUNCTION increment_poll_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment option votes
    UPDATE poll_options
    SET votes = votes + 1
    WHERE id = NEW.option_id;
    
    -- Increment total poll votes
    UPDATE polls
    SET total_votes = total_votes + 1
    WHERE id = NEW.poll_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_poll_votes
    AFTER INSERT ON poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION increment_poll_vote_counts();

-- Decrement vote counts when a vote is removed
CREATE OR REPLACE FUNCTION decrement_poll_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrement option votes
    UPDATE poll_options
    SET votes = votes - 1
    WHERE id = OLD.option_id;
    
    -- Decrement total poll votes
    UPDATE polls
    SET total_votes = total_votes - 1
    WHERE id = OLD.poll_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_decrement_poll_votes
    AFTER DELETE ON poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION decrement_poll_vote_counts();

-- =====================================================
-- VALIDATION TRIGGER (prevent voting after expiration)
-- =====================================================
CREATE OR REPLACE FUNCTION validate_poll_vote()
RETURNS TRIGGER AS $$
DECLARE
    poll_expired BOOLEAN;
    allows_multiple BOOLEAN;
    existing_votes INTEGER;
BEGIN
    -- Check if poll has expired
    SELECT (expires_at < NOW()), allows_multiple_choices
    INTO poll_expired, allows_multiple
    FROM polls
    WHERE id = NEW.poll_id;
    
    IF poll_expired THEN
        RAISE EXCEPTION 'Cannot vote on expired poll';
    END IF;
    
    -- For single-choice polls, ensure user hasn't already voted
    IF NOT allows_multiple THEN
        SELECT COUNT(*)
        INTO existing_votes
        FROM poll_votes
        WHERE poll_id = NEW.poll_id AND user_id = NEW.user_id;
        
        IF existing_votes > 0 THEN
            RAISE EXCEPTION 'User has already voted on this poll';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_poll_vote
    BEFORE INSERT ON poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION validate_poll_vote();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_media ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLLS TABLE RLS POLICIES
-- =====================================================

-- Anyone can view polls (public read)
CREATE POLICY "Polls are viewable by everyone"
    ON polls FOR SELECT
    USING (true);

-- Only post owner can create polls for their posts
CREATE POLICY "Users can create polls for their own posts"
    ON polls FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_id
            AND posts.author_id = auth.uid()
        )
    );

-- Only post owner can update their polls (before expiration)
CREATE POLICY "Users can update their own polls"
    ON polls FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_id
            AND posts.author_id = auth.uid()
        )
        AND expires_at > NOW()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_id
            AND posts.author_id = auth.uid()
        )
    );

-- Only post owner can delete their polls
CREATE POLICY "Users can delete their own polls"
    ON polls FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_id
            AND posts.author_id = auth.uid()
        )
    );

-- =====================================================
-- POLL OPTIONS TABLE RLS POLICIES
-- =====================================================

-- Anyone can view poll options
CREATE POLICY "Poll options are viewable by everyone"
    ON poll_options FOR SELECT
    USING (true);

-- Only poll owner (post owner) can create options
CREATE POLICY "Users can create options for their own polls"
    ON poll_options FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
        )
    );

-- Only poll owner can update options (before any votes)
CREATE POLICY "Users can update options for their own polls"
    ON poll_options FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
            AND polls.total_votes = 0
        )
    );

-- Only poll owner can delete options (before any votes)
CREATE POLICY "Users can delete options from their own polls"
    ON poll_options FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
            AND polls.total_votes = 0
        )
    );

-- =====================================================
-- POLL VOTES TABLE RLS POLICIES
-- =====================================================

-- Users can view all votes (for transparency)
CREATE POLICY "Poll votes are viewable by everyone"
    ON poll_votes FOR SELECT
    USING (true);

-- Authenticated users can vote (insert)
CREATE POLICY "Authenticated users can vote on polls"
    ON poll_votes FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- Users can delete their own votes (change vote)
CREATE POLICY "Users can delete their own votes"
    ON poll_votes FOR DELETE
    USING (user_id = auth.uid());

-- =====================================================
-- POLL MEDIA TABLE RLS POLICIES
-- =====================================================

-- Anyone can view poll media
CREATE POLICY "Poll media is viewable by everyone"
    ON poll_media FOR SELECT
    USING (true);

-- Only poll owner can add media
CREATE POLICY "Users can add media to their own polls"
    ON poll_media FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
        )
    );

-- Only poll owner can update media
CREATE POLICY "Users can update media on their own polls"
    ON poll_media FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
        )
    );

-- Only poll owner can delete media
CREATE POLICY "Users can delete media from their own polls"
    ON poll_media FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id = poll_id
            AND posts.author_id = auth.uid()
        )
    );

-- =====================================================
-- HELPER FUNCTIONS FOR CLIENT-SIDE
-- =====================================================

-- Function to get poll results with viewer's vote status
CREATE OR REPLACE FUNCTION get_poll_with_viewer_status(poll_id_input UUID, viewer_id UUID DEFAULT auth.uid())
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', p.id,
        'post_id', p.post_id,
        'question', p.question,
        'allows_multiple_choices', p.allows_multiple_choices,
        'total_votes', p.total_votes,
        'expires_at', p.expires_at,
        'created_at', p.created_at,
        'options', (
            SELECT json_agg(
                json_build_object(
                    'id', po.id,
                    'text', po.text,
                    'votes', po.votes,
                    'position', po.position
                )
                ORDER BY po.position
            )
            FROM poll_options po
            WHERE po.poll_id = p.id
        ),
        'viewer_selected_options', (
            SELECT json_agg(pv.option_id)
            FROM poll_votes pv
            WHERE pv.poll_id = p.id AND pv.user_id = viewer_id
        ),
        'media', (
            SELECT json_build_object(
                'type', pm.type,
                'url', pm.url
            )
            FROM poll_media pm
            WHERE pm.poll_id = p.id
        )
    )
    INTO result
    FROM polls p
    WHERE p.id = poll_id_input;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cast a vote (handles multiple-choice logic)
CREATE OR REPLACE FUNCTION cast_poll_vote(
    poll_id_input UUID,
    option_ids_input UUID[],
    voter_id UUID DEFAULT auth.uid()
)
RETURNS JSON AS $$
DECLARE
    allows_multiple BOOLEAN;
    option_id UUID;
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
    FOREACH option_id IN ARRAY option_ids_input
    LOOP
        INSERT INTO poll_votes (poll_id, option_id, user_id)
        VALUES (poll_id_input, option_id, voter_id)
        ON CONFLICT (user_id, option_id) DO NOTHING;
    END LOOP;
    
    -- Return updated poll status
    RETURN get_poll_with_viewer_status(poll_id_input, voter_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_poll_with_viewer_status(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, UUID[], UUID) TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE polls IS 'Stores poll data attached to posts';
COMMENT ON TABLE poll_options IS 'Stores individual options for each poll';
COMMENT ON TABLE poll_votes IS 'Tracks user votes for poll options';
COMMENT ON TABLE poll_media IS 'Optional media (image/link) for polls';

COMMENT ON FUNCTION get_poll_with_viewer_status IS 'Returns poll data with viewer-specific voting status';
COMMENT ON FUNCTION cast_poll_vote IS 'Casts votes for a poll, handling single/multiple choice logic';