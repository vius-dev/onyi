import { Poll } from '@/models/Poll';
import { Post } from '@/models/Post';
import { supabase } from '@/utils/supabase';

// Map poll data from Supabase RPC to Poll interface
function mapPollData(rawPoll: any, currentUserId?: string): Poll | undefined {
    if (!rawPoll) return undefined;

    const options = (rawPoll.options || []).map((opt: any) => ({
        id: opt.id,
        text: opt.text,
        votes: opt.votes || 0,
    }));

    const viewerSelectedOptions = rawPoll.viewer_selected_options || [];

    return {
        id: rawPoll.id,
        question: rawPoll.question,
        options: options,
        media: rawPoll.media || undefined,
        allows_multiple_choices: rawPoll.allows_multiple_choices,
        viewer_selected_options: viewerSelectedOptions,
        total_votes: rawPoll.total_votes || 0,
        expires_at: rawPoll.expires_at,
        created_at: rawPoll.created_at,
    };
}

// Fetch post detail with parent and top-level replies
export const fetchPostDetail = async (postId: string, currentUserId?: string) => {
    try {
        // 1. Fetch main post
        const { data: mainPost, error: mainError } = await supabase
            .from("posts")
            .select(`
        *,
        user:profiles(*),
        post_reactions(count),
        post_reposts(count),
        post_quotes:post_quotes!post_quotes_quote_post_id_fkey(count)
      `)
            .eq("id", postId)
            .maybeSingle();

        if (mainError) throw mainError;
        if (!mainPost) return null;

        // 2. Fetch parent post if exists
        let parentPost = null;
        if (mainPost.parent_post_id) {
            const { data } = await supabase
                .from("posts")
                .select("*, user:profiles(*)")
                .eq("id", mainPost.parent_post_id)
                .maybeSingle();
            parentPost = data;
        }

        // 3. Fetch ONLY top-level replies (lazy load)
        const { data: topReplies } = await supabase
            .from("posts")
            .select(`
        *,
        user:profiles(*),
        post_reactions(count),
        post_reposts(count)
      `)
            .eq("parent_post_id", postId)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .limit(20);

        // 4. Fetch user reactions for visible posts


        // 4.5 Fetch full thread stack if main post is in a thread
        let fullThread: Post[] = [];
        if (mainPost.thread_id) {
            const { data: threadData } = await supabase
                .from("posts")
                .select(`
                    *,
                    user:profiles(*),
                    post_reactions(count),
                    post_reposts(count),
                    post_quotes:post_quotes!post_quotes_quote_post_id_fkey(count)
                `)
                .eq("thread_id", mainPost.thread_id)
                .eq("is_reply", false) // Only count thread/root posts, not replies
                .order("sequence_number", { ascending: true });

            if (threadData) {
                // We'll map these later
                fullThread = threadData;
            }
        }

        // 4.6 Fetch thread info for all visible posts (including thread stack)
        const allVisiblePosts = [
            mainPost,
            parentPost,
            ...(topReplies || []),
            ...(fullThread || [])
        ].filter(Boolean);

        const visiblePostIds = allVisiblePosts.map(p => p.id);

        const threadIds = new Set(
            allVisiblePosts.map(p => p.thread_id).filter(Boolean)
        );

        const threadCounts = new Map<string, number>();
        for (const tid of threadIds) {
            const { count } = await supabase
                .from("posts")
                .select('*', { count: 'exact', head: true })
                .eq("thread_id", tid)
                .eq("is_reply", false); // Only count thread posts
            threadCounts.set(tid as string, count || 0);
        }

        // 4.7 Fetch polls for all visible posts
        const postIds = allVisiblePosts.map(p => p.id);
        const pollsMap = new Map<string, Poll>();

        // Fetch poll references
        const { data: pollsData } = await supabase
            .from("polls")
            .select("id, post_id")
            .in("post_id", postIds);

        // Fetch poll details with viewer status using RPC
        if (pollsData && pollsData.length > 0) {
            for (const pollRef of pollsData) {
                const { data: pollData, error: pollError } = await supabase
                    .rpc('get_poll_with_viewer_status', {
                        poll_id_input: pollRef.id,
                        viewer_id: currentUserId || null
                    });

                if (!pollError && pollData) {
                    const mappedPoll = mapPollData(pollData, currentUserId);
                    if (mappedPoll) {
                        pollsMap.set(pollRef.post_id, mappedPoll);
                    }
                }
            }
        }

        let myReactionsMap = new Map<string, string>();
        if (currentUserId && visiblePostIds.length > 0) {
            const { data: reactions } = await supabase
                .from("post_reactions")
                .select("post_id, type")
                .in("post_id", visiblePostIds)
                .eq("user_id", currentUserId);

            reactions?.forEach(r => myReactionsMap.set(r.post_id, r.type));
        }

        // 5. Map posts to Post model
        const mapPost = (p: any): Post => {


            return {
                ...p,
                text: p.content,
                user: p.user,
                like_count: p.post_reactions?.[0]?.count || 0,
                repost_count: p.post_reposts?.[0]?.count || 0,
                quote_count: p.post_quotes?.[0]?.count || 0,
                reply_count: p.reply_count || 0,
                dislike_count: 0,
                is_deleted: !!p.deleted_at,
                my_reaction: myReactionsMap.get(p.id) || null,
                poll: pollsMap.get(p.id), // Attach poll data from RPC
                thread_total: p.thread_id ? threadCounts.get(p.thread_id) : undefined,
            };
        };

        return {
            mainPost: mapPost(mainPost),
            parentPost: parentPost ? mapPost(parentPost) : null,
            replies: (topReplies || []).map(mapPost),
            threadStack: fullThread.map(mapPost),
        };

    } catch (error) {
        console.error("Error fetching post detail:", error);
        return null;
    }
};
