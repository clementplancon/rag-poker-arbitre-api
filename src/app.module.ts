import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { RagModule } from './rag/rag.module';
import { AuthModule } from './auth/auth.module';
import { QuotasModule } from './quotas/quotas.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { QuotaLog } from './quotas/quota.entity';
import { DocVersion } from './docs/doc-version.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'sqlite',
        database: cfg.get<string>('SQLITE_DB') || 'db.sqlite',
        entities: [User, QuotaLog, DocVersion],
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([User, QuotaLog, DocVersion]),
    AuthModule,
    QuotasModule,

    HealthModule,
    EmbeddingsModule,
    QdrantModule,
    RagModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
