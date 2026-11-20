import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { importReportToJson, InvalidDpeXmlError } from '@hes/domain';
import { IMPORT_DPE_XML_USE_CASE, ImportDpeXmlUseCase } from '@hes/application';
import { MAX_DPE_XML_BYTES } from '@hes/dpe-xml-importer';
import { ErrorResponseDto, ImportDpeResponseDto } from './dto/import-dpe-response.dto.ts';

/**
 * Thin controller for the Diagnostic Import bounded context. All business
 * logic lives in ImportDpeXmlUseCase (application layer); this class only
 * adapts HTTP (multipart upload) to the use case.
 */
@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  private readonly useCase: ImportDpeXmlUseCase;

  constructor(@Inject(IMPORT_DPE_XML_USE_CASE) useCase: ImportDpeXmlUseCase) {
    this.useCase = useCase;
  }

  /**
   * Imports a French DPE XML file (multipart field `file`, ≤ 5 MB).
   *
   * @returns { buildingId, report } (201)
   * @throws 422 with schemaErrors when the XML is invalid or fails DPE schema validation
   * @throws 413 when the upload exceeds 5 MB
   */
  @Post('dpe')
  @ApiOperation({ summary: 'Import a French DPE XML file (multipart upload, max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } }
    }
  })
  @ApiResponse({ status: 201, description: 'DPE imported and persisted', type: ImportDpeResponseDto })
  @ApiResponse({ status: 422, description: 'Invalid XML or DPE schema validation errors', type: ErrorResponseDto })
  @ApiResponse({ status: 413, description: 'Upload larger than 5 MB', type: ErrorResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DPE_XML_BYTES },
      fileFilter: (_req, file, callback) => {
        const name = file.originalname.toLowerCase();
        const isXml =
          name.endsWith('.xml') || file.mimetype === 'text/xml' || file.mimetype === 'application/xml';
        if (!isXml) {
          callback(new BadRequestException('only .xml DPE files are accepted'), false);
          return;
        }
        callback(null, true);
      }
    })
  )
  async importDpe(@UploadedFile() file: Express.Multer.File | undefined): Promise<ImportDpeResponseDto> {
    if (file === undefined) {
      throw new InvalidDpeXmlError('multipart field "file" with a DPE XML document is required');
    }
    const { buildingId, report } = await this.useCase.execute(file.buffer.toString('utf8'));
    return { buildingId, report: importReportToJson(report) };
  }
}
