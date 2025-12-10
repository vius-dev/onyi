-- =====================================================
-- NOTIFICATIONS MIGRATION WITH TWITTER-LIKE RLS SECURITY
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('like', 'reply', 'repost', 'follow', 'quote', 'mention')),
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate notifications for the same action
    CONSTRAINT unique_notification UNIQUE (user_id, type, actor_id, post_id, created_at)
);

-- Indexes for faster lookups
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_actor_id ON notifications(actor_id);
CREATE INDEX idx_notifications_post_id ON notifications(post_id) WHERE post_id IS NOT NULL;

-- =====================================================
-- NOTIFICATION AGGREGATIONS TABLE (for "X and 5 others")
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_aggregations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('like', 'repost')),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    actor_ids UUID[] NOT NULL, -- Array of user IDs who performed the action
    total_count INTEGER NOT NULL DEFAULT 1,
    last_actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One aggregation per user/type/post
    CONSTRAINT unique_aggregation UNIQUE (user_id, type, post_id)
);

-- Indexes for aggregations
CREATE INDEX idx_notification_aggs_user_id ON notification_aggregations(user_id);
CREATE INDEX idx_notification_aggs_updated_at ON notification_aggregations(updated_at DESC);

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE TRIGGER update_notification_aggs_updated_at
    BEFORE UPDATE ON notification_aggregations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- NOTIFICATION CREATION TRIGGERS
-- =====================================================

-- Trigger for LIKE notifications
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    -- Get the post author
    SELECT author_id INTO post_author_id
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Don't notify if user liked their own post
    IF post_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;
    
    -- Check if notification type should be like
    IF NEW.type = 'like' THEN
        -- Try to add to aggregation first
        INSERT INTO notification_aggregations (user_id, type, post_id, actor_ids, last_actor_id, total_count)
        VALUES (post_author_id, 'like', NEW.post_id, ARRAY[NEW.user_id], NEW.user_id, 1)
        ON CONFLICT (user_id, type, post_id) 
        DO UPDATE SET
            actor_ids = array_append(notification_aggregations.actor_ids, NEW.user_id),
            last_actor_id = NEW.user_id,
            total_count = notification_aggregations.total_count + 1,
            updated_at = NOW(),
            is_read = false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_like_notification
    AFTER INSERT ON post_reactions
    FOR EACH ROW
    WHEN (NEW.type = 'like')
    EXECUTE FUNCTION create_like_notification();

-- Trigger for REPLY notifications
CREATE OR REPLACE FUNCTION create_reply_notification()
RETURNS TRIGGER AS $$
DECLARE
    parent_author_id UUID;
BEGIN
    -- Only create notification if this is a reply
    IF NEW.parent_post_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get the parent post author
    SELECT author_id INTO parent_author_id
    FROM posts
    WHERE id = NEW.parent_post_id;
    
    -- Don't notify if user replied to their own post
    IF parent_author_id = NEW.author_id THEN
        RETURN NEW;
    END IF;
    
    -- Create notification
    INSERT INTO notifications (user_id, type, actor_id, post_id)
    VALUES (parent_author_id, 'reply', NEW.author_id, NEW.id)
    ON CONFLICT DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reply_notification
    AFTER INSERT ON posts
    FOR EACH ROW
    WHEN (NEW.parent_post_id IS NOT NULL)
    EXECUTE FUNCTION create_reply_notification();

-- Trigger for FOLLOW notifications
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Don't notify if someone follows themselves (shouldn't happen but just in case)
    IF NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
    END IF;
    
    -- Create notification
    INSERT INTO notifications (user_id, type, actor_id, post_id)
    VALUES (NEW.following_id, 'follow', NEW.follower_id, NULL)
    ON CONFLICT DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_follow_notification
    AFTER INSERT ON follows
    FOR EACH ROW
    EXECUTE FUNCTION create_follow_notification();

-- Trigger for REPOST notifications
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    -- Get the post author
    SELECT author_id INTO post_author_id
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Don't notify if user reposted their own post
    IF post_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;
    
    -- Try to add to aggregation first
    INSERT INTO notification_aggregations (user_id, type, post_id, actor_ids, last_actor_id, total_count)
    VALUES (post_author_id, 'repost', NEW.post_id, ARRAY[NEW.user_id], NEW.user_id, 1)
    ON CONFLICT (user_id, type, post_id) 
    DO UPDATE SET
        actor_ids = array_append(notification_aggregations.actor_ids, NEW.user_id),
        last_actor_id = NEW.user_id,
        total_count = notification_aggregations.total_count + 1,
        updated_at = NOW(),
        is_read = false;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repost_notification
    AFTER INSERT ON post_reposts
    FOR EACH ROW
    EXECUTE FUNCTION create_repost_notification();

-- Trigger for QUOTE notifications
-- CREATE OR REPLACE FUNCTION create_quote_notification()
-- RETURNS TRIGGER AS $$
-- DECLARE
--     quoted_post_author_id UUID;
-- BEGIN
--     -- Only create notification if this is a quote
--     IF NEW.quoted_post_id IS NULL THEN
--         RETURN NEW;
--     END IF;
--     
--     -- Get the quoted post author
--     SELECT author_id INTO quoted_post_author_id
--     FROM posts
--     WHERE id = NEW.quoted_post_id;
--     
--     -- Don't notify if user quoted their own post
--     IF quoted_post_author_id = NEW.author_id THEN
--         RETURN NEW;
--     END IF;
--     
--     -- Create notification
--     INSERT INTO notifications (user_id, type, actor_id, post_id)
--     VALUES (quoted_post_author_id, 'quote', NEW.author_id, NEW.id)
--     ON CONFLICT DO NOTHING;
--     
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
-- 
-- CREATE TRIGGER trigger_quote_notification
--     AFTER INSERT ON posts
--     FOR EACH ROW
--     WHEN (NEW.quoted_post_id IS NOT NULL)
--     EXECUTE FUNCTION create_quote_notification();

-- Trigger for MENTION notifications
CREATE OR REPLACE FUNCTION create_mention_notification()
RETURNS TRIGGER AS $$
DECLARE
    mentioned_username TEXT;
    mentioned_user_id UUID;
    username_pattern TEXT := '@([a-zA-Z0-9_]+)';
    matches TEXT[];
BEGIN
    -- Extract all @mentions from content
    matches := regexp_matches(NEW.content, username_pattern, 'g');
    
    -- For each mention, create a notification
    FOREACH mentioned_username IN ARRAY matches
    LOOP
        -- Remove @ symbol
        mentioned_username := trim(leading '@' from mentioned_username);
        
        -- Find user by username
        SELECT id INTO mentioned_user_id
        FROM profiles
        WHERE username = mentioned_username;
        
        -- If user exists and it's not the author mentioning themselves
        IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.author_id THEN
            INSERT INTO notifications (user_id, type, actor_id, post_id)
            VALUES (mentioned_user_id, 'mention', NEW.author_id, NEW.id)
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mention_notification
    AFTER INSERT ON posts
    FOR EACH ROW
    WHEN (NEW.content ~ '@[a-zA-Z0-9_]+')
    EXECUTE FUNCTION create_mention_notification();

-- =====================================================
-- CLEANUP TRIGGERS (remove notifications when action is undone)
-- =====================================================

-- Remove like notification when unliked
CREATE OR REPLACE FUNCTION remove_like_notification()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    IF OLD.type != 'like' THEN
        RETURN OLD;
    END IF;
    
    SELECT author_id INTO post_author_id
    FROM posts
    WHERE id = OLD.post_id;
    
    -- Remove from aggregation
    UPDATE notification_aggregations
    SET 
        actor_ids = array_remove(actor_ids, OLD.user_id),
        total_count = total_count - 1,
        updated_at = NOW()
    WHERE user_id = post_author_id 
        AND type = 'like' 
        AND post_id = OLD.post_id;
    
    -- Delete aggregation if no actors left
    DELETE FROM notification_aggregations
    WHERE user_id = post_author_id 
        AND type = 'like' 
        AND post_id = OLD.post_id
        AND total_count <= 0;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_remove_like_notification
    AFTER DELETE ON post_reactions
    FOR EACH ROW
    WHEN (OLD.type = 'like')
    EXECUTE FUNCTION remove_like_notification();

-- Remove follow notification when unfollowed
CREATE OR REPLACE FUNCTION remove_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM notifications
    WHERE user_id = OLD.following_id 
        AND type = 'follow' 
        AND actor_id = OLD.follower_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_remove_follow_notification
    AFTER DELETE ON follows
    FOR EACH ROW
    EXECUTE FUNCTION remove_follow_notification();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_aggregations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- NOTIFICATIONS TABLE RLS POLICIES
-- =====================================================

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    USING (user_id = auth.uid());

-- System can insert notifications (via triggers)
CREATE POLICY "System can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- NOTIFICATION AGGREGATIONS RLS POLICIES
-- =====================================================

-- Users can only view their own aggregations
CREATE POLICY "Users can view their own aggregations"
    ON notification_aggregations FOR SELECT
    USING (user_id = auth.uid());

-- Users can mark their own aggregations as read
CREATE POLICY "Users can update their own aggregations"
    ON notification_aggregations FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own aggregations
CREATE POLICY "Users can delete their own aggregations"
    ON notification_aggregations FOR DELETE
    USING (user_id = auth.uid());

-- System can insert/update aggregations (via triggers)
CREATE POLICY "System can insert aggregations"
    ON notification_aggregations FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- HELPER FUNCTIONS FOR CLIENT-SIDE
-- =====================================================

-- Function to get all notifications with actor details (enriched)
CREATE OR REPLACE FUNCTION get_notifications_with_details(
    viewer_id UUID DEFAULT auth.uid(),
    notification_limit INTEGER DEFAULT 50,
    include_read BOOLEAN DEFAULT true
)
RETURNS TABLE (
    id UUID,
    type TEXT,
    actor_id UUID,
    actor_username TEXT,
    actor_display_name TEXT,
    actor_avatar TEXT,
    post_id UUID,
    post_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    is_read BOOLEAN,
    additional_actors INTEGER
) AS $$
BEGIN
    RETURN QUERY
    -- Get individual notifications
    SELECT 
        n.id,
        n.type,
        n.actor_id,
        p.username as actor_username,
        p.display_name as actor_display_name,
        p.profile_picture_url as actor_avatar,
        n.post_id,
        po.content as post_content,
        n.created_at,
        n.is_read,
        NULL::INTEGER as additional_actors
    FROM notifications n
    LEFT JOIN profiles p ON n.actor_id = p.id
    LEFT JOIN posts po ON n.post_id = po.id
    WHERE n.user_id = viewer_id
        AND (include_read OR n.is_read = false)
        AND n.type NOT IN ('like', 'repost') -- Exclude aggregated types
    
    UNION ALL
    
    -- Get aggregated notifications
    SELECT 
        na.id,
        na.type,
        na.last_actor_id as actor_id,
        p.username as actor_username,
        p.display_name as actor_display_name,
        p.profile_picture_url as actor_avatar,
        na.post_id,
        po.content as post_content,
        na.updated_at as created_at,
        na.is_read,
        (na.total_count - 1) as additional_actors
    FROM notification_aggregations na
    LEFT JOIN profiles p ON na.last_actor_id = p.id
    LEFT JOIN posts po ON na.post_id = po.id
    WHERE na.user_id = viewer_id
        AND (include_read OR na.is_read = false)
    
    ORDER BY created_at DESC
    LIMIT notification_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_as_read(notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Try to update in notifications table
    UPDATE notifications
    SET is_read = true
    WHERE id = notification_id AND user_id = auth.uid();
    
    IF FOUND THEN
        RETURN true;
    END IF;
    
    -- Try to update in aggregations table
    UPDATE notification_aggregations
    SET is_read = true
    WHERE id = notification_id AND user_id = auth.uid();
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read()
RETURNS INTEGER AS $$
    DECLARE
        updated_count INTEGER := 0;
        temp_count INTEGER;
    BEGIN
        -- Update individual notifications
        UPDATE notifications
        SET is_read = true
        WHERE user_id = auth.uid() AND is_read = false;
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        
        -- Update aggregated notifications
        UPDATE notification_aggregations
        SET is_read = true
        WHERE user_id = auth.uid() AND is_read = false;
        
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        updated_count := updated_count + temp_count;
        
        RETURN updated_count;
    END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(viewer_id UUID DEFAULT auth.uid())
RETURNS INTEGER AS $$
DECLARE
    total_count INTEGER;
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM notifications WHERE user_id = viewer_id AND is_read = false) +
        (SELECT COUNT(*) FROM notification_aggregations WHERE user_id = viewer_id AND is_read = false)
    INTO total_count;
    
    RETURN COALESCE(total_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete old read notifications (cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_notifications(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
    DECLARE
        deleted_count INTEGER := 0;
        temp_count INTEGER;
    BEGIN
        -- Delete old read notifications
        DELETE FROM notifications
        WHERE is_read = true 
            AND created_at < NOW() - (days_old || ' days')::INTERVAL;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        -- Delete old read aggregations
        DELETE FROM notification_aggregations
        WHERE is_read = true 
            AND updated_at < NOW() - (days_old || ' days')::INTERVAL;
        
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        deleted_count := deleted_count + temp_count;
        
        RETURN deleted_count;
    END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_notifications_with_details TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_as_read TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_as_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_notifications TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE notifications IS 'Stores individual notifications (replies, follows, quotes, mentions)';
COMMENT ON TABLE notification_aggregations IS 'Stores aggregated notifications (likes, reposts) to reduce clutter';

COMMENT ON FUNCTION get_notifications_with_details IS 'Returns enriched notifications with actor and post details';
COMMENT ON FUNCTION mark_notification_as_read IS 'Marks a single notification as read';
COMMENT ON FUNCTION mark_all_notifications_as_read IS 'Marks all user notifications as read';
COMMENT ON FUNCTION get_unread_notification_count IS 'Returns count of unread notifications';
COMMENT ON FUNCTION cleanup_old_notifications IS 'Deletes old read notifications (default 30 days)';