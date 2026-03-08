import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Post extends Model {
  public id!: string;
  public user_id!: string;
  public content!: string;
  public images!: string; // JSON string of image URLs
  public media!: string; // JSON string of media items
  public likes_count!: number;
  public views_count!: number;
  public comments_count!: number;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Post.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    images: {
      type: DataTypes.TEXT, // Store as JSON string for cross-dialect simplicity
      allowNull: true,
      defaultValue: '[]',
    },
    media: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
    },
    likes_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    views_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    comments_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'posts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

export default Post;
