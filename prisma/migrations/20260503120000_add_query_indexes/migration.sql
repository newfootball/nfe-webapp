-- Account lookup used by Better Auth credential checks
CREATE INDEX "Account_userId_providerId_idx" ON "Account"("userId", "providerId");

-- User discovery and sitemap queries
CREATE INDEX "User_isOnboarded_createdAt_idx" ON "User"("isOnboarded", "createdAt");
CREATE INDEX "User_userType_isOnboarded_idx" ON "User"("userType", "isOnboarded");
CREATE INDEX "User_updatedAt_idx" ON "User"("updatedAt");

-- Follow counts and follower/following lists
CREATE INDEX "Follow_followerId_createdAt_idx" ON "Follow"("followerId", "createdAt");
CREATE INDEX "Follow_followingId_createdAt_idx" ON "Follow"("followingId", "createdAt");

-- Feed, profile and search result ordering
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");
CREATE INDEX "Post_status_createdAt_idx" ON "Post"("status", "createdAt");
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");

-- Relation includes and engagement lists
CREATE INDEX "Media_postId_idx" ON "Media"("postId");
CREATE INDEX "Like_userId_createdAt_idx" ON "Like"("userId", "createdAt");
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");

-- Notification inbox and unread counters
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- Conversation pages and inbox grouping
CREATE INDEX "Message_fromUserId_toUserId_createdAt_idx" ON "Message"("fromUserId", "toUserId", "createdAt");
CREATE INDEX "Message_fromUserId_createdAt_idx" ON "Message"("fromUserId", "createdAt");
CREATE INDEX "Message_toUserId_createdAt_idx" ON "Message"("toUserId", "createdAt");

-- Moderation queue
CREATE INDEX "PostSignal_status_createdAt_idx" ON "PostSignal"("status", "createdAt");
