from adaddin import AladdinMultiAgentSystem
import os
from custom_agents.wrapper import DatabricksContext
async def run_aladdin_multi_agent(query: str, context: DatabricksContext = None):
    """
    Run the complete Aladdin multi-agent system
    """
    if context is None:
        context = DatabricksContext(
            host=os.getenv("host"),
            token=os.getenv("token")
        )
    
    # Create multi-agent system
    aladdin_system = AladdinMultiAgentSystem(context)
    
    # Process the query
    final_response = await aladdin_system.process_query(query)
    
    # Print execution summary
    # print("\n" + "="*60)
    # print("📊 EXECUTION SUMMARY:")
    # summary = aladdin_system.get_execution_summary()
    # for key, value in summary.items():
    #     print(f"{key}: {value}")
    
    return final_response



async def main():
    """Example usage of the Aladdin multi-agent system"""
    
    # Create context
    context = DatabricksContext(
        host=os.getenv("host"),
        token=os.getenv("token")
    )
    
    # Example queries showcasing different complexity levels

    
    query="Why do older customers place fewer repeat orders compared to younger ones?"        
    await run_aladdin_multi_agent(query, context)
        
    print("\n" + "✅ QUERY COMPLETED" + "\n")

if __name__ == "__main__":
    # Run example
    import asyncio
    asyncio.run(main())

