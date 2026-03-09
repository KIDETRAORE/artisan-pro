export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "ArtisanPro API",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:8080",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ApiErrorBody: {
        type: "object",
        required: ["success", "error", "requestId"],
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
          details: { type: "object", nullable: true },
        },
      },

      DashboardResponse: {
        type: "object",
        properties: {
          subscription: {
            type: "object",
            properties: {
              plan: { type: "string", enum: ["free", "pro"] },
              status: { type: "string" },
            },
          },
          quota: {
            type: "object",
            properties: {
              used: { type: "number" },
              limit: { type: "number" },
            },
          },
        },
      },

      AiRunResponse: {
        type: "object",
        properties: {
          jobId: { type: "string" },
        },
      },

      AiStatusResponse: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "processing", "completed", "failed"],
          },
          result: { nullable: true },
          error: { type: "string", nullable: true },
        },
      },

      StripePortalResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          url: { type: "string", nullable: true },
        },
      },
    },
  },

  security: [{ bearerAuth: [] }],

  paths: {
    "/dashboard": {
      get: {
        summary: "Get dashboard data",
        responses: {
          "200": {
            description: "Dashboard data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorBody" },
              },
            },
          },
        },
      },
    },

    "/ai/run": {
      post: {
        summary: "Run AI task",
        responses: {
          "200": {
            description: "Job created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AiRunResponse" },
              },
            },
          },
          "403": {
            description: "Quota exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorBody" },
              },
            },
          },
        },
      },
    },

    "/ai/status/{jobId}": {
      get: {
        summary: "Get AI job status",
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Job status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AiStatusResponse" },
              },
            },
          },
        },
      },
    },

    "/stripe/create-checkout-session": {
      post: {
        summary: "Create Stripe checkout session",
        responses: {
          "200": {
            description: "Checkout URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StripePortalResponse" },
              },
            },
          },
        },
      },
    },

    "/stripe/portal": {
      post: {
        summary: "Open Stripe billing portal",
        responses: {
          "200": {
            description: "Portal URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StripePortalResponse" },
              },
            },
          },
        },
      },
    },
  },
};