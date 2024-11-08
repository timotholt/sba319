// This is the base class for all database engines
//
// Most important is that you HAVE to have a schema for Firebase,
// and that when you initialize your model, we fill in any
// undefined arrays with an empty array, cause Firebase does NOT
// like anything undefined.
//

export class BaseDbEngine {
    _initializeData(model, data) {
        // If no data or no schema, return as is
        if (!data || !model.schema) return data;

        const initialized = { ...data };
        
        // Initialize arrays and other schema-defined fields
        Object.entries(model.schema).forEach(([field, config]) => {
        if (config.type === 'array' && !initialized[field]) {
            initialized[field] = config.default || [];
        }
        });
        
        return initialized;
    }

    async connect() {
        // Base implementation - override in specific engines
        return Promise.resolve();
    }

    async find(collection, query) {
        throw new Error('Method not implemented');
    }

    async findOne(collection, query) {
        throw new Error('Method not implemented');
    }

    async create(collection, data) {
        throw new Error('Method not implemented');
    }

    async update(collection, query, data) {
        throw new Error('Method not implemented');
    }

    async delete(collection, query) {
        throw new Error('Method not implemented');
    }
}