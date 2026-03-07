import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Message extends Model {
  public id!: string;
  public sender_id!: string;
  public receiver_id!: string;
  public content!: string;
  public message_type!: string;
  public is_read!: boolean;
  public readonly created_at!: Date;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    receiver_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    message_type: {
      type: DataTypes.ENUM('text', 'image', 'voice', 'system'),
      defaultValue: 'text',
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default Message;
