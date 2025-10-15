import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagService } from './rag.service';
import { RagAskController } from './rag.ask.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { RagRetrieveController } from './rag.retrieve.controller';

@Module({
  imports: [ConfigModule, EmbeddingsModule, QdrantModule],
  providers: [RagService],
  controllers: [RagRetrieveController, RagAskController],
  exports: [RagService],
})
export class RagModule {}
