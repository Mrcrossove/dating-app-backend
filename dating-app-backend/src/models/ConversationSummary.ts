import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class ConversationSummary extends Model {
  public id!: string;
  public user_id!: string;
  public peer_user_id!: string;
  public peer_im_user_id!: string | null;
  public chat_type!: string;
  public last_message_content!: string;
  public last_message_type!: string;
  public last_message_direction!: string;
  public last_message_at!: Date;
  public unread_count!: number;
  public is_blocked!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ConversationSummary.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    peer_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    peer_im_user_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    chat_type: {
      type: DataTypes.ENUM('singleChat'),
      allowNull: false,
      defaultValue: 'singleChat',
    },
    last_message_content: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    last_message_type: {
      type: DataTypes.ENUM('text', 'image', 'voice', 'system'),
      allowNull: false,
      defaultValue: 'text',
    },
    last_message_direction: {
      type: DataTypes.ENUM('send', 'receive'),
      allowNull: false,
      defaultValue: 'send',
    },
    last_message_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    unread_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'conversation_summaries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'peer_user_id'],
      },
      {
        fields: ['user_id', 'last_message_at'],
      },
    ],
  }
);

export default ConversationSummary;
