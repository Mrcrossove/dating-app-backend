import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';
import Post from './Post';

class PostComment extends Model {
  public id!: string;
  public post_id!: string;
  public user_id!: string;
  public content!: string;
  public readonly created_at!: Date;
}

PostComment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    post_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Post,
        key: 'id',
      },
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
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'post_comments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

export default PostComment;
