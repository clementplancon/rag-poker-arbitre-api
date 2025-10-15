import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    EmbeddingsModule,
    QdrantModule,
    RagModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
