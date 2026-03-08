import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';
import Post from './Post';

class PostView extends Model {
  public id!: string;
  public post_id!: string;
  public user_id!: string;
  public readonly created_at!: Date;
}

PostView.init(
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
  },
  {
    sequelize,
    tableName: 'post_views',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['post_id', 'user_id'],
      },
    ],
  }
);

export default PostView;
