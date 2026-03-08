import User from './User';
import Photo from './Photo';
import BaziInfo from './BaziInfo';
import Match from './Match';
import Message from './Message';
import Verification from './Verification';
import Like from './Like';
import Post from './Post';
import AuthRecord from './AuthRecord';
import Feedback from './Feedback';
import PostLike from './PostLike';
import PostComment from './PostComment';
import PostView from './PostView';
import Entitlement from './Entitlement';
import Block from './Block';
import Report from './Report';
import RefreshToken from './RefreshToken';
import LoginEvent from './LoginEvent';

// User Associations
User.hasMany(Photo, { foreignKey: 'user_id', as: 'photos' });
Photo.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(BaziInfo, { foreignKey: 'user_id', as: 'bazi_info' });
BaziInfo.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Match, { foreignKey: 'user1_id', as: 'matches_as_user1' });
User.hasMany(Match, { foreignKey: 'user2_id', as: 'matches_as_user2' });
Match.belongsTo(User, { foreignKey: 'user1_id', as: 'user1' });
Match.belongsTo(User, { foreignKey: 'user2_id', as: 'user2' });

User.hasMany(Message, { foreignKey: 'sender_id', as: 'sent_messages' });
User.hasMany(Message, { foreignKey: 'receiver_id', as: 'received_messages' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });

User.hasOne(Verification, { foreignKey: 'user_id', as: 'verification' });
Verification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Like, { foreignKey: 'user_id', as: 'likes' });
Like.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Like.belongsTo(User, { foreignKey: 'target_id', as: 'target_user' });

User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PostLike, { foreignKey: 'user_id', as: 'post_likes' });
PostLike.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PostLike.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

User.hasMany(PostComment, { foreignKey: 'user_id', as: 'post_comments' });
PostComment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PostComment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

User.hasMany(PostView, { foreignKey: 'user_id', as: 'post_views' });
PostView.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PostView.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

User.hasMany(AuthRecord, { foreignKey: 'user_id', as: 'auth_records' });
AuthRecord.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Feedback, { foreignKey: 'user_id', as: 'feedback' });
Feedback.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Entitlement, { foreignKey: 'user_id', as: 'entitlements' });
Entitlement.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Block, { foreignKey: 'user_id', as: 'blocks' });
Block.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Block.belongsTo(User, { foreignKey: 'target_id', as: 'target_user' });

User.hasMany(Report, { foreignKey: 'user_id', as: 'reports' });
Report.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Report.belongsTo(User, { foreignKey: 'target_id', as: 'target_user' });

User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refresh_tokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(LoginEvent, { foreignKey: 'user_id', as: 'login_events' });
LoginEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export {
  User,
  Photo,
  BaziInfo,
  Match,
  Message,
  Verification,
  Like,
  Post,
  AuthRecord,
  Feedback,
  PostLike,
  PostComment,
  PostView,
  Entitlement,
  Block,
  Report,
  RefreshToken,
  LoginEvent
};
