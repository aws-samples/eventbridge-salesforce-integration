// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const dynamodbClient = new AWS.DynamoDB.DocumentClient();
const eventbridgeClient = new AWS.EventBridge({apiVersion: '2015-10-07'});

// Environment Variable
const ORDERS_TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const API_DESTINATION_EVENT_BUS = process.env.API_DESTINATION_EVENT_BUS;

exports.appHandler = async (event, context) => {
    console.log("EVENT: \n" + JSON.stringify(event, null, 2))

    try {
        console.log("RECEIVED PAYLOAD: \n" + JSON.stringify(event['detail']['payload'], null, 2))
        const customerId = event['detail']['payload']['CustomerID__c'];
        if (customerId === '') {
            console.log("CustomerID not provided in event payload");
        } else {
            console.log("CustomerID is provided in event payload. Querying order history...");
            const orders = await getItem(customerId);
            console.log("DynamoDB Response: \n" + JSON.stringify(orders, null, 2));
            if (orders["Count"] > 0) {
                const recentOrders = orders["Items"]
                const caseId = event['detail']['payload']['CaseID__c'];
                const res = await sendEvents(recentOrders[0], caseId);
                console.log("EVENT SENT TO SF: \n" + JSON.stringify(res, null, 2));
            }
        }
    } catch (e) {
        console.log("Entering Catch Block");
        console.log(e);
        return {
            error: e,
            statusCode: 400
        }
    }

    return {
      statusCode: 200,
    };
}

async function getItem(id) {
    const params = {
        KeyConditionExpression: '#id = :value',
        ExpressionAttributeValues: { ':value': id },
        ExpressionAttributeNames: { '#id': 'CustomerID' },
        Limit: 3,
        TableName: ORDERS_TABLE_NAME
    };
    console.log("DYNAMODB QUERY PARAMS: \n" + JSON.stringify(params, null, 2))
    try {
        return dynamodbClient.query(params).promise();
    } catch (error) {
        return error
    }
}

async function sendEvents(payload, case_id) {
    const params = {
        Entries: [
            {
                Detail: JSON.stringify({
                    amount_paid: payload['AmountPaid'],
                    items_purchased: payload['ItemsPurchased'].toString(),
                    order_date: payload['OrderDate'],
                    case_id: case_id
                }),
                DetailType: 'Enrich Case',
                Source: 'case.enrich',
                EventBusName: API_DESTINATION_EVENT_BUS,
            }
        ]
    };
    console.log("SENDING EVENTS TO SF: \n" + JSON.stringify(params, null, 2))
    try {
        return eventbridgeClient.putEvents(params).promise();
    } catch (error) {
        return error
    }

}