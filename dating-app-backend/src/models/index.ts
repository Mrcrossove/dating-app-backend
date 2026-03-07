import User from './User';
import Photo from './Photo';
import BaziInfo from './BaziInfo';
import Match from './Match';
import Message from './Message';
import Verification from './Verification';
import Like from './Like';
import Post from './Post';

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

export {
  User,
  Photo,
  BaziInfo,
  Match,
  Message,
  Verification,
  Like,
  Post
};