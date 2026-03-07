import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Post extends Model {
  public id!: number;
  public user_id!: number;
  public content!: string;
  public images!: string; // JSON string of image URLs
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Post.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    images: {
      type: DataTypes.TEXT, // Storing as JSON string for simplicity in SQLite/Simple DB
      allowNull: true,
      defaultValue: '[]'
    },
  },
  {
    sequelize,
    tableName: 'posts',
    underscored: true,
  }
);

export default Post;
