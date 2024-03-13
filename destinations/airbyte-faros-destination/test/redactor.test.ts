import {FarosDestinationRedactor} from '../src/destination-redactor';

describe('FarosDestinationRedactor', () => {
  let redactor: FarosDestinationRedactor;

  beforeEach(async () => {
    redactor = new FarosDestinationRedactor();
  });

  describe('redact', () => {
    const record = {
      name: 'Test for test@test.com. End',
      description: 'The phone number is (555) 987-6543. End',
    };
    it('should leave unchanged', async () => {
      const redacted = redactor.redactRecord(record, []);
      expect(redacted).toMatchObject(record);
    });

    it('should replace single field', async () => {
      const redacted = redactor.redactRecord(record, ['description']);
      expect(redacted).toMatchObject({
        ...record,
        description: 'The phone number is PHONE_NUMBER. End',
      });
    });

    it('should replace multiple fields', async () => {
      const redacted = redactor.redactRecord(record, ['name', 'description']);
      expect(redacted).toMatchObject({
        name: 'Test for EMAIL_ADDRESS. End',
        description: 'The phone number is PHONE_NUMBER. End',
      });
    });

    it('should replace matching custom pattern', async () => {
      redactor = new FarosDestinationRedactor(undefined, 'secretword');
      const redacted = redactor.redactRecord(
        {name: 'The secret word is secretword. End'},
        ['name']
      );
      expect(redacted).toMatchObject({
        name: 'The secret word is REDACTED. End',
      });
    });

    it('should replace with custom value', async () => {
      redactor = new FarosDestinationRedactor('REDACTED');
      const redacted = redactor.redactRecord(
        {name: 'Test for test@test.com. End'},
        ['name']
      );
      expect(redacted).toMatchObject({name: 'Test for REDACTED. End'});
    });
  });
});
